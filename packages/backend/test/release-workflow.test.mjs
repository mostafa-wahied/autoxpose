import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';

const workflows = new URL('../../../.github/workflows/', import.meta.url);
const docker = parse(readFileSync(new URL('docker-publish.yml', workflows), 'utf8'));
const source = parse(readFileSync(new URL('lint.yml', workflows), 'utf8'));
const release = parse(readFileSync(new URL('auto-tag.yml', workflows), 'utf8'));

test('version announcement is downstream of promotion and cannot trigger a tag rebuild', () => {
  assert.equal(docker.on.push.tags, undefined);
  assert.deepEqual(Object.keys(release.on), ['workflow_call']);
  assert.deepEqual(docker.jobs.release.needs, ['regression', 'publish']);
  assert.match(docker.jobs.release.if, /needs.publish.outputs.release == 'true'/);
  assert.equal(docker.jobs.release.uses, './.github/workflows/auto-tag.yml');
  assert.ok(release.jobs['auto-tag'].steps.some(step => step.with?.name === 'qualified-release'));
  assert.equal(docker.jobs.publish.concurrency['cancel-in-progress'], false);
});

test('both native images run context, database and shipped application checks before pushing', () => {
  const build = docker.jobs['build-and-push'];
  assert.deepEqual(build.strategy.matrix.include, [
    { architecture: 'amd64', runner: 'ubuntu-24.04' },
    { architecture: 'arm64', runner: 'ubuntu-24.04-arm' },
  ]);
  assert.equal(build['runs-on'], '${{ matrix.runner }}');
  const names = build.steps.map(step => step.name);
  const push = names.indexOf('Push tested platform image');
  for (const name of [
    'Verify Docker build context',
    'Verify native database binding',
    'Test Docker image',
    'Verify shipped application contracts',
  ]) {
    assert.ok(names.indexOf(name) >= 0 && names.indexOf(name) < push);
    assert.equal(build.steps.find(step => step.name === name).if, undefined);
  }
  assert.match(
    build.steps.find(step => step.name === 'Verify shipped application contracts').env
      .EXPECTED_IMAGE,
    /steps.build.outputs.imageid/
  );
  assert.equal(build.strategy['fail-fast'], false);
  assert.equal(build['timeout-minutes'], 30);
});

test('fork PRs cannot log in, push images or announce releases', () => {
  const steps = docker.jobs['build-and-push'].steps;
  for (const name of [
    'Log in to Docker Hub',
    'Push tested platform image',
    'Verify and record platform digest',
    'Upload platform digest',
  ]) {
    assert.equal(steps.find(step => step.name === name).if, "github.event_name != 'pull_request'");
  }
  assert.match(docker.jobs.publish.if, /github.event_name != 'pull_request'/);
  assert.match(docker.jobs.release.if, /github.event_name == 'push'/);
  assert.equal(steps.find(step => step.id === 'build').with.push, undefined);
  assert.equal(steps.find(step => step.id === 'build').with.load, true);
});

test('publication requires both source qualification and the complete native matrix', () => {
  assert.equal(docker.jobs.source.uses, './.github/workflows/lint.yml');
  assert.ok(Object.hasOwn(source.on, 'workflow_call'));
  assert.equal(docker.jobs.regression.name, 'regression');
  assert.equal(docker.jobs.regression.if, 'always()');
  assert.deepEqual(docker.jobs.regression.needs, ['source', 'build-and-push']);
  assert.deepEqual(docker.jobs.publish.needs, ['regression', 'build-and-push']);
  assert.match(docker.jobs.publish.if, /needs.regression.result == 'success'/);
});

test('aggregate rejects skipped, cancelled, failed, missing and unknown prerequisites', () => {
  const gate = docker.jobs.regression.steps[0];
  const success = { source: { result: 'success' }, 'build-and-push': { result: 'success' } };
  const check = results =>
    spawnSync('bash', ['-e', '-o', 'pipefail', '-c', gate.run], {
      env: { ...process.env, REQUIRED_RESULTS: JSON.stringify(results) },
      encoding: 'utf8',
      timeout: 10000,
    });
  assert.equal(check(success).status, 0);
  for (const name of Object.keys(success)) {
    for (const result of ['failure', 'skipped', 'cancelled', 'timed_out', null]) {
      assert.notEqual(check({ ...success, [name]: { result } }).status, 0);
    }
    const missing = structuredClone(success);
    delete missing[name];
    assert.notEqual(check(missing).status, 0);
  }
  assert.notEqual(check({ ...success, unexpected: { result: 'success' } }).status, 0);
});
