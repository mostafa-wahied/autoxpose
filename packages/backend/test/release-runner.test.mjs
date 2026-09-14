import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createReleaseRunner } from '../../../scripts/release.mjs';

class ReleaseFixture {
  sha = 'a'.repeat(40);
  mainSha = this.sha;
  image = 'owner/autoxpose';
  version = '0.5.2';
  previous = '0.5.1';
  tagSha = null;
  release = null;
  writes = [];
  manifests = new Map();
  aliases = new Map();

  constructor(context) {
    this.directory = mkdtempSync(path.join(os.tmpdir(), 'autoxpose-release-'));
    context.after(() => rmSync(this.directory, { recursive: true, force: true }));
    mkdirSync(path.join(this.directory, 'digests'));
    const entries = ['amd64', 'arm64'].map((architecture, index) =>
      this.platform(architecture, index)
    );
    this.combined = { schemaVersion: 2, manifests: entries };
    this.combinedDigest = `sha256:${'9'.repeat(64)}`;
    this.manifests.set(this.combinedDigest, this.combined);
    this.environment = {
      GITHUB_REPOSITORY: this.image,
      GITHUB_SHA: this.sha,
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'push',
      IMAGE: this.image,
      RUNNER_TEMP: this.directory,
      GITHUB_OUTPUT: path.join(this.directory, 'outputs'),
      METADATA: JSON.stringify({ tags: [`${this.image}:main`, `${this.image}:latest`] }),
    };
    this.runner = createReleaseRunner((...args) => this.execute(...args), this.environment);
  }

  platform(architecture, index) {
    const config = `sha256:${String(index + 1).repeat(64)}`;
    const digest = `sha256:${String(index + 3).repeat(64)}`;
    const manifest = `sha256:${String(index + 5).repeat(64)}`;
    const descriptor = { digest: manifest, platform: { os: 'linux', architecture } };
    this.manifests.set(digest, { manifests: [descriptor] });
    this.manifests.set(manifest, { config: { digest: config } });
    writeFileSync(
      path.join(this.directory, 'digests', architecture),
      JSON.stringify({ config, digest, revision: this.sha, tested: true })
    );
    return descriptor;
  }

  github(route, method, input) {
    if (method === 'POST') {
      const body = JSON.parse(input);
      this.writes.push({ command: 'github', route, body });
      if (route === 'git/tags') return { sha: 'b'.repeat(40) };
      if (route === 'git/refs') this.tagSha = this.sha;
      if (route === 'releases') this.release = body;
      return body;
    }
    if (route === 'git/ref/heads/main') return { object: { sha: this.mainSha } };
    if (route.startsWith('git/matching-refs/tags/'))
      return this.tagSha
        ? [{ ref: `refs/tags/v${this.version}`, object: { type: 'tag', sha: 'b'.repeat(40) } }]
        : [];
    if (route.startsWith('git/tags/')) return { object: { type: 'commit', sha: this.tagSha } };
    if (route.startsWith('releases/tags/')) return this.release;
    throw new Error(`Unexpected GitHub read: ${route}`);
  }

  docker(args) {
    assert.deepEqual(args.slice(0, 2), ['buildx', 'imagetools']);
    if (args[2] === 'create') {
      if (args.includes('--dry-run')) return JSON.stringify(this.combined);
      this.writes.push({ command: 'docker', args });
      for (let index = 3; index < args.length; index += 1) {
        if (args[index] === '--tag') this.aliases.set(args[index + 1], this.combinedDigest);
      }
      return '';
    }
    assert.equal(args[2], 'inspect');
    const reference = args[3] === '--raw' ? args[4] : args[3];
    const digest = reference.includes('@') ? reference.split('@')[1] : this.aliases.get(reference);
    if (!digest || !this.manifests.has(digest)) return null;
    return JSON.stringify(args.includes('--raw') ? this.manifests.get(digest) : { digest });
  }

  execute(command, args, input) {
    if (command === 'gh') {
      const output = this.github(args[1].replace(`repos/${this.image}/`, ''), args[3], input);
      return output === null ? null : JSON.stringify(output);
    }
    if (command === 'docker') return this.docker(args);
    assert.equal(command, 'git');
    if (args[0] === 'rev-parse') return this.sha;
    assert.equal(args[0], 'show');
    return JSON.stringify({ version: args[1].includes('^:') ? this.previous : this.version });
  }
}

test('qualified release promotes exact platforms before creating tag and announcement', context => {
  const fixture = new ReleaseFixture(context);
  fixture.runner.prepare();
  assert.throws(() => fixture.runner.announce(), /ENOENT/);
  assert.deepEqual(fixture.writes, []);
  const publication = fixture.runner.promote();
  assert.equal(publication.digest, fixture.combinedDigest);
  assert.equal(fixture.release, null);
  fixture.runner.announce();
  assert.deepEqual(
    fixture.writes.map(item => (item.command === 'docker' ? 'promote' : item.route)),
    ['promote', 'git/tags', 'git/refs', 'releases']
  );
  assert.equal(fixture.release.target_commitish, fixture.sha);
  const count = fixture.writes.length;
  fixture.runner.announce();
  assert.equal(fixture.writes.length, count);
});

test('wrong artifacts and stale source stop promotion before any write', context => {
  for (const fault of ['wrong-config', 'missing-platform', 'stale-source']) {
    const fixture = new ReleaseFixture(context);
    fixture.runner.prepare();
    if (fault === 'wrong-config')
      fixture.manifests.get(`sha256:${'5'.repeat(64)}`).config.digest = `sha256:${'0'.repeat(64)}`;
    if (fault === 'missing-platform') rmSync(path.join(fixture.directory, 'digests', 'arm64'));
    if (fault === 'stale-source') fixture.mainSha = 'c'.repeat(40);
    assert.throws(() => fixture.runner.promote());
    assert.deepEqual(fixture.writes, []);
  }
});

test('existing version images are never replaced and conflicting images block all aliases', context => {
  const fixture = new ReleaseFixture(context);
  fixture.aliases.set(`${fixture.image}:${fixture.version}`, fixture.combinedDigest);
  fixture.runner.prepare();
  fixture.runner.promote();
  assert.equal(fixture.writes[0].args.includes(`${fixture.image}:${fixture.version}`), false);
  const conflict = new ReleaseFixture(context);
  const wrong = `sha256:${'8'.repeat(64)}`;
  conflict.manifests.set(wrong, { manifests: [] });
  conflict.aliases.set(`${conflict.image}:${conflict.version}`, wrong);
  conflict.runner.prepare();
  assert.throws(() => conflict.runner.promote());
  assert.deepEqual(conflict.writes, []);
});

test('same-version changes publish only main aliases and cannot announce a new release', context => {
  const fixture = new ReleaseFixture(context);
  fixture.previous = fixture.version;
  assert.equal(fixture.runner.prepare().changed, false);
  fixture.runner.promote();
  assert.deepEqual([...fixture.aliases.keys()].sort(), [
    `${fixture.image}:latest`,
    `${fixture.image}:main`,
  ]);
  assert.throws(() => fixture.runner.announce(), /No version change/);
  assert.equal(fixture.writes.length, 1);
});

test('untrusted events and modified qualification receipts cannot create releases', context => {
  const fixture = new ReleaseFixture(context);
  fixture.environment.GITHUB_EVENT_NAME = 'pull_request';
  assert.throws(() => fixture.runner.prepare(), /push event/);
  fixture.environment.GITHUB_EVENT_NAME = 'push';
  fixture.runner.prepare();
  fixture.runner.promote();
  const filename = path.join(fixture.directory, 'publication.json');
  const receipt = JSON.parse(readFileSync(filename, 'utf8'));
  receipt.sha = 'b'.repeat(40);
  writeFileSync(filename, JSON.stringify(receipt));
  assert.throws(() => fixture.runner.announce(), /source differs/);
  assert.equal(fixture.writes.filter(item => item.command === 'github').length, 0);
});

test('announcement recovery after main advances does not republish image aliases', context => {
  const fixture = new ReleaseFixture(context);
  fixture.runner.prepare();
  fixture.runner.promote();
  fixture.mainSha = 'c'.repeat(40);
  fixture.runner.announce();
  assert.equal(fixture.release.target_commitish, fixture.sha);
  assert.equal(fixture.writes.filter(item => item.command === 'docker').length, 1);
  assert.throws(() => fixture.runner.promote(), /current main/);
});
