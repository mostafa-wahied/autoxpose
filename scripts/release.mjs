import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRelease, verifyExistingRelease, verifyPublication } from './release-plan.mjs';

function execute(command, args, input) {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8000000,
  });
  if (result.status !== 0) {
    const missingRead =
      (command === 'gh' && args.includes('GET') && /HTTP 404/.test(result.stderr || '')) ||
      (command === 'docker' &&
        args.includes('inspect') &&
        /manifest unknown|not found/i.test(result.stderr || ''));
    if (missingRead) return null;
    throw new Error(
      `${command} failed (${result.error?.code || result.status}); stop and inspect the failed step`
    );
  }
  return result.stdout.trim();
}

class ReleaseRunner {
  constructor(run, environment) {
    this.run = run;
    this.environment = environment;
    this.repository = environment.GITHUB_REPOSITORY;
    this.sha = environment.GITHUB_SHA;
    this.image = environment.IMAGE;
    this.directory = environment.RUNNER_TEMP;
  }

  git(...args) {
    const result = this.run('git', args);
    assert.notEqual(result, null, 'Git source is unavailable');
    return result;
  }

  github(route, method = 'GET', body) {
    const args = ['api', `repos/${this.repository}/${route}`, '--method', method];
    if (body) args.push('--input', '-');
    const output = this.run('gh', args, body ? JSON.stringify(body) : undefined);
    return output === null ? null : output ? JSON.parse(output) : {};
  }

  docker(...args) {
    return this.run('docker', ['buildx', 'imagetools', ...args]);
  }

  inspect(reference) {
    const raw = this.docker('inspect', reference, '--format', '{{json .Manifest}}');
    if (raw === null) return null;
    const descriptor = JSON.parse(raw);
    assert.match(descriptor.digest, /^sha256:[a-f0-9]{64}$/);
    const content = this.docker('inspect', '--raw', `${this.image}@${descriptor.digest}`);
    assert.notEqual(content, null, 'Published manifest vanished');
    return { digest: descriptor.digest, manifest: JSON.parse(content) };
  }
  read(name) {
    return JSON.parse(readFileSync(path.join(this.directory, name), 'utf8'));
  }
  write(name, value) {
    writeFileSync(path.join(this.directory, name), JSON.stringify(value, null, 2) + '\n');
  }

  sourcePlan(requireCurrentMain = true) {
    const { environment, sha, repository } = this;
    assert.equal(environment.GITHUB_REF, 'refs/heads/main', 'Publication requires main');
    assert.equal(environment.GITHUB_EVENT_NAME, 'push', 'Publication requires a push event');
    assert.equal(this.git('rev-parse', 'HEAD'), sha, 'Checkout does not match event source');
    const main = requireCurrentMain ? this.github('git/ref/heads/main') : { object: { sha } };
    assert.ok(main, 'Main reference is missing');
    const version = JSON.parse(this.git('show', `${sha}:package.json`)).version;
    const previous = JSON.parse(this.git('show', `${sha}^:package.json`)).version;
    const changelog = version === previous ? undefined : this.git('show', `${sha}:CHANGELOG.md`);
    return planRelease({ repository, sha, mainSha: main.object.sha, version, previous, changelog });
  }

  existingRelease(plan) {
    const refs = this.github(`git/matching-refs/tags/${plan.tag}`);
    assert.ok(Array.isArray(refs), 'Cannot read existing release refs');
    const ref = refs.find(item => item.ref === `refs/tags/${plan.tag}`);
    let tagSha = null;
    if (ref) {
      assert.equal(ref.object.type, 'tag', 'Release tag must remain annotated');
      const tag = this.github(`git/tags/${ref.object.sha}`);
      assert.equal(tag.object.type, 'commit');
      tagSha = tag.object.sha;
    }
    const release = this.github(`releases/tags/${plan.tag}`);
    const existing = { tagSha, release };
    verifyExistingRelease(plan, existing);
    return existing;
  }

  prepare() {
    const plan = this.sourcePlan();
    if (plan.changed) this.existingRelease(plan);
    this.write('release-plan.json', plan);
    appendFileSync(
      this.environment.GITHUB_OUTPUT,
      `changed=${plan.changed}\nversion=${plan.version}\nseries=${plan.series}\n`
    );
    return plan;
  }

  qualifiedPlatforms() {
    const { sha, image } = this;
    const platforms = {};
    const sources = [];
    for (const architecture of ['amd64', 'arm64']) {
      const evidence = this.read(`digests/${architecture}`);
      assert.equal(evidence.revision, sha, 'Qualification belongs to another source');
      assert.equal(evidence.tested, true, 'Platform test receipt is missing');
      assert.match(evidence.digest, /^sha256:[a-f0-9]{64}$/);
      assert.match(evidence.config, /^sha256:[a-f0-9]{64}$/);
      const uploaded = this.inspect(`${image}@${evidence.digest}`);
      assert.ok(uploaded, 'Qualified image is missing');
      let manifest = uploaded;
      if (uploaded.manifest.manifests) {
        const selected = uploaded.manifest.manifests.filter(
          item => item.platform?.os === 'linux' && item.platform.architecture === architecture
        );
        assert.equal(selected.length, 1, 'Expected exactly one qualified platform');
        manifest = this.inspect(`${image}@${selected[0].digest}`);
      }
      assert.equal(
        manifest.manifest.config.digest,
        evidence.config,
        'Published configuration differs from tested image'
      );
      platforms[architecture] = {
        config: evidence.config,
        manifest: manifest.digest,
        revision: sha,
        tested: true,
      };
      sources.push(`${image}@${evidence.digest}`);
    }
    return { platforms, sources };
  }

  verifyManifest(manifest, platforms) {
    assert.ok(Array.isArray(manifest.manifests), 'Multi-platform index is required');
    const linux = manifest.manifests.filter(item => item.platform?.os === 'linux');
    assert.deepEqual(linux.map(item => item.platform.architecture).sort(), ['amd64', 'arm64']);
    for (const item of linux)
      assert.equal(item.digest, platforms[item.platform.architecture].manifest);
  }

  promote() {
    const { image, sha, environment } = this;
    assert.match(image, /^[\w.-]+\/[\w.-]+$/, 'Invalid image repository');
    const plan = this.sourcePlan();
    assert.deepEqual(plan, this.read('release-plan.json'), 'Release plan changed');
    if (plan.changed) this.existingRelease(plan);
    const qualified = this.qualifiedPlatforms();
    const draft = JSON.parse(this.docker('create', '--dry-run', ...qualified.sources));
    this.verifyManifest(draft, qualified.platforms);
    const metadata = JSON.parse(environment.METADATA);
    assert.deepEqual([...metadata.tags].sort(), [`${image}:latest`, `${image}:main`]);
    const tags = [...metadata.tags];
    let sources = qualified.sources;
    if (plan.changed) {
      const existing = this.inspect(`${image}:${plan.version}`);
      if (existing) {
        this.verifyManifest(existing.manifest, qualified.platforms);
        sources = [`${image}@${existing.digest}`];
      } else {
        tags.push(`${image}:${plan.version}`);
      }
      tags.push(`${image}:${plan.series}`);
    }
    assert.equal(
      this.github('git/ref/heads/main').object.sha,
      sha,
      'A newer main commit blocks stale promotion'
    );
    assert.notEqual(
      this.docker('create', ...tags.flatMap(tag => ['--tag', tag]), ...sources),
      null
    );
    const published = this.inspect(`${image}:main`);
    assert.ok(published, 'Published image is missing');
    this.verifyManifest(published.manifest, qualified.platforms);
    for (const tag of tags)
      assert.equal(this.inspect(tag)?.digest, published.digest, 'Published tags disagree');
    if (plan.changed)
      assert.equal(this.inspect(`${image}:${plan.version}`)?.digest, published.digest);
    const publication = {
      sha,
      version: plan.version,
      digest: published.digest,
      platforms: qualified.platforms,
    };
    verifyPublication(plan, publication);
    this.write('publication.json', publication);
    appendFileSync(
      environment.GITHUB_OUTPUT,
      `digest=${publication.digest}\nchanged=${plan.changed}\n`
    );
    return publication;
  }

  announce() {
    const { image, sha } = this;
    const plan = this.sourcePlan(false);
    assert.deepEqual(plan, this.read('release-plan.json'), 'Release source changed');
    assert.equal(plan.changed, true, 'No version change to announce');
    const publication = this.read('publication.json');
    verifyPublication(plan, publication);
    const published = this.inspect(`${image}:${plan.version}`);
    assert.equal(published?.digest, publication.digest, 'Qualified numbered image changed');
    this.verifyManifest(published.manifest, publication.platforms);
    const existing = this.existingRelease(plan);
    if (!existing.tagSha) {
      const tag = this.github('git/tags', 'POST', {
        tag: plan.tag,
        message: `Release version ${plan.version}`,
        object: sha,
        type: 'commit',
      });
      assert.match(tag.sha, /^[a-f0-9]{40}$/);
      this.github('git/refs', 'POST', { ref: `refs/tags/${plan.tag}`, sha: tag.sha });
    }
    if (!existing.release) {
      this.github('releases', 'POST', {
        tag_name: plan.tag,
        target_commitish: sha,
        name: plan.title,
        body: plan.body,
        draft: false,
        prerelease: false,
      });
    }
    const verified = this.existingRelease(plan);
    assert.ok(verified.release, 'Release announcement is missing');
    return verified;
  }
}

export function createReleaseRunner(run = execute, environment = process.env) {
  const runner = new ReleaseRunner(run, environment);
  return {
    prepare: () => runner.prepare(),
    promote: () => runner.promote(),
    announce: () => runner.announce(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runner = createReleaseRunner();
  assert.ok(Object.hasOwn(runner, process.argv[2]), 'Unknown release operation');
  runner[process.argv[2]]();
}
