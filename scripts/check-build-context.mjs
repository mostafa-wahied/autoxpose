import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const directory = mkdtempSync(path.join(os.tmpdir(), 'autoxpose-context-'));
const context = path.join(directory, 'context');
const excluded = [
  'node_modules/host-binding.node',
  'packages/backend/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'packages/frontend/node_modules/host-binding.node',
  '.env',
  'packages/backend/.env.production',
  'nested/.secrets.env',
  '.secrets.json',
  'nested/.npmrc',
  'nested/private.key',
  'nested/certificate.pem',
  'packages/backend/data/autoxpose.db',
  'nested/storage.sqlite',
  'nested/storage.db-wal',
  'nested/coverage/report.json',
  'nested/.cache/result',
  'dist/app.js',
  '.git/config',
];
const retained = [
  'package.json',
  'packages/backend/src/data/metadata.json',
  'packages/backend/src/index.ts',
];

function seed(filename, contents = 'SYNTHETIC_CONTEXT_SENTINEL') {
  const target = path.join(context, filename);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function inspectContext(destination) {
  execFileSync(
    'docker',
    [
      'buildx',
      'build',
      '--progress=quiet',
      '--file',
      path.join(context, 'Dockerfile'),
      '--output',
      `type=local,dest=${destination}`,
      context,
    ],
    { timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  for (const filename of retained)
    assert.ok(
      existsSync(path.join(destination, filename)),
      `Required source excluded: ${filename}`
    );
  const leaked = excluded.filter(filename => existsSync(path.join(destination, filename)));
  return leaked;
}

try {
  for (const filename of [...excluded, ...retained]) seed(filename);
  seed('Dockerfile', 'FROM scratch\nCOPY . /\n');
  seed('.dockerignore', readFileSync(path.join(root, '.dockerignore'), 'utf8'));
  const qualified = inspectContext(path.join(directory, 'qualified'));
  assert.deepEqual(
    qualified,
    [],
    'Build context contains host dependencies or private/generated data'
  );
  seed('.dockerignore', '');
  const control = inspectContext(path.join(directory, 'negative'));
  assert.equal(
    control.length,
    excluded.length,
    'Dirty-context negative control did not reproduce contamination'
  );
  console.log(
    JSON.stringify({
      passed: true,
      excluded: excluded.length,
      retained: retained.length,
      negativeControlLeaks: control.length,
    })
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
