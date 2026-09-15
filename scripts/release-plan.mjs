import assert from 'node:assert/strict';

export function compareVersions(left, right) {
  const expression = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  assert.match(left, expression, 'Invalid release version');
  assert.match(right, expression, 'Invalid previous version');
  const previous = right.split('.').map(Number);
  for (const [index, value] of left.split('.').map(Number).entries()) {
    if (value !== previous[index]) return Math.sign(value - previous[index]);
  }
  return 0;
}

function versionNotes(changelog, version) {
  assert.equal(typeof changelog, 'string', 'Versioned release requires a changelog');
  const headings = [...changelog.matchAll(/^## \[([^\]\r\n]+)\][^\r\n]*$/gm)];
  const matches = headings.filter(heading => heading[1] === version);
  assert.equal(matches.length, 1, 'Expected exactly one changelog section for the release');
  const heading = matches[0];
  const next = headings[headings.indexOf(heading) + 1];
  const notes = changelog.slice(heading.index + heading[0].length, next?.index).trim();
  assert.match(notes, /^- \S/m, 'Release notes must contain at least one change');
  return notes;
}

export function planRelease(input) {
  assert.match(input.sha, /^[a-f0-9]{40}$/, 'Invalid source revision');
  assert.equal(input.sha, input.mainSha, 'Source is no longer current main');
  assert.match(input.repository, /^[\w.-]+\/[\w.-]+$/, 'Invalid repository');
  const comparison = compareVersions(input.version, input.previous);
  assert.ok(comparison >= 0, 'Version must not decrease');
  const changed = comparison > 0;
  const { changelog, ...source } = input;
  const body = changed
    ? `${versionNotes(changelog, input.version)}\n\n**Full Changelog**: https://github.com/${input.repository}/compare/v${input.previous}...v${input.version}`
    : '';
  return {
    ...source,
    changed,
    tag: `v${input.version}`,
    series: input.version.split('.').slice(0, 2).join('.'),
    title: `Release ${input.version}`,
    body,
  };
}

export function verifyExistingRelease(plan, existing) {
  if (existing.tagSha !== null)
    assert.equal(existing.tagSha, plan.sha, 'Existing tag moved or belongs to another source');
  if (existing.release) {
    assert.equal(existing.tagSha, plan.sha, 'Published release tag is missing');
    assert.equal(existing.release.tag_name, plan.tag, 'Unexpected release tag');
    assert.equal(existing.release.target_commitish, plan.sha, 'Existing release source differs');
    assert.equal(existing.release.name, plan.title, 'Existing release title differs');
    assert.equal(existing.release.body.trim(), plan.body, 'Existing release notes differ');
    assert.equal(existing.release.draft, false, 'Existing release is a draft');
    assert.equal(existing.release.prerelease, false, 'Existing release is a prerelease');
  }
}

export function verifyPublication(plan, publication) {
  assert.equal(publication.sha, plan.sha, 'Qualified source differs');
  assert.equal(publication.version, plan.version, 'Qualified version differs');
  assert.match(publication.digest, /^sha256:[a-f0-9]{64}$/, 'Invalid qualified image digest');
  assert.deepEqual(
    Object.keys(publication.platforms).sort(),
    ['amd64', 'arm64'],
    'Both qualified platforms are required'
  );
  for (const platform of Object.values(publication.platforms)) {
    assert.match(platform.config, /^sha256:[a-f0-9]{64}$/);
    assert.match(platform.manifest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(platform.revision, plan.sha, 'Platform source differs');
    assert.equal(platform.tested, true, 'Platform was not qualified');
  }
}
