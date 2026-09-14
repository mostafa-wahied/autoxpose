import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planRelease,
  verifyExistingRelease,
  verifyPublication,
} from '../../../scripts/release-plan.mjs';

const sha = 'a'.repeat(40);
const input = {
  version: '0.5.2',
  previous: '0.5.1',
  sha,
  mainSha: sha,
  repository: 'owner/autoxpose',
};

test('release plan keeps current naming and notes and only releases version increases', () => {
  const plan = planRelease(input);
  assert.equal(plan.changed, true);
  assert.equal(plan.tag, 'v0.5.2');
  assert.equal(plan.series, '0.5');
  assert.equal(plan.title, 'Release 0.5.2');
  assert.match(plan.body, /compare\/v0\.5\.1\.\.\.v0\.5\.2$/);
  assert.equal(planRelease({ ...input, version: '0.5.1' }).changed, false);
  assert.throws(() => planRelease({ ...input, version: '0.4.9' }), /decrease/);
  assert.throws(() => planRelease({ ...input, mainSha: 'b'.repeat(40) }), /current main/);
  for (const version of ['0.5.2\nchanged=true', 'v0.5.2', '0.5.2-beta', '01.5.2']) {
    assert.throws(() => planRelease({ ...input, version }), /Invalid/);
  }
});

test('release retries preserve exact existing tags and reject moved or deleted tags', () => {
  const plan = planRelease(input);
  const release = {
    tag_name: plan.tag,
    target_commitish: sha,
    name: plan.title,
    body: plan.body,
    draft: false,
    prerelease: false,
  };
  verifyExistingRelease(plan, { tagSha: null, release: null });
  verifyExistingRelease(plan, { tagSha: sha, release: null });
  verifyExistingRelease(plan, { tagSha: sha, release });
  assert.throws(
    () => verifyExistingRelease(plan, { tagSha: 'b'.repeat(40), release: null }),
    /another source/
  );
  assert.throws(() => verifyExistingRelease(plan, { tagSha: null, release }), /missing/);
  for (const field of ['name', 'body', 'target_commitish', 'tag_name']) {
    assert.throws(() =>
      verifyExistingRelease(plan, { tagSha: sha, release: { ...release, [field]: 'changed' } })
    );
  }
});

test('release requires both exact qualified platforms and their source revision', () => {
  const plan = planRelease(input);
  const digest = `sha256:${'c'.repeat(64)}`;
  const platform = { config: digest, manifest: digest, revision: sha, tested: true };
  const publication = {
    sha,
    version: input.version,
    digest,
    platforms: { amd64: platform, arm64: platform },
  };
  verifyPublication(plan, publication);
  for (const architecture of ['amd64', 'arm64']) {
    const missing = structuredClone(publication);
    delete missing.platforms[architecture];
    assert.throws(() => verifyPublication(plan, missing), /Both qualified/);
    const untested = structuredClone(publication);
    untested.platforms[architecture].tested = false;
    assert.throws(() => verifyPublication(plan, untested), /not qualified/);
    const wrong = structuredClone(publication);
    wrong.platforms[architecture].revision = 'b'.repeat(40);
    assert.throws(() => verifyPublication(plan, wrong), /source differs/);
  }
  assert.throws(
    () => verifyPublication(plan, { ...publication, sha: 'b'.repeat(40) }),
    /source differs/
  );
});
