import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire('/app/packages/backend/package.json');
const architecture = { amd64: 'x64', arm64: 'arm64' }[process.env.EXPECTED_ARCHITECTURE];
assert.ok(architecture, 'Expected architecture is required');
assert.equal(process.platform, 'linux');
assert.equal(process.arch, architecture);
const Database = require('better-sqlite3');
const database = new Database(':memory:');
try {
  database.exec('CREATE TABLE contract (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  database.prepare('INSERT INTO contract (id, value) VALUES (?, ?)').run(1, 'preserved');
  assert.equal(
    database.prepare('SELECT value FROM contract WHERE id = 1').get().value,
    'preserved'
  );
  assert.throws(
    database.transaction(() => {
      database.prepare('UPDATE contract SET value = ? WHERE id = 1').run('must roll back');
      throw new Error('transaction control');
    }),
    /transaction control/
  );
  assert.equal(
    database.prepare('SELECT value FROM contract WHERE id = 1').get().value,
    'preserved'
  );
  assert.equal(database.pragma('quick_check', { simple: true }), 'ok');
} finally {
  database.close();
}

const bindingPath = Object.keys(require.cache).find(filename =>
  filename.endsWith('/better_sqlite3.node')
);
assert.ok(bindingPath, 'SQLite native binding was not loaded');
const binding = readFileSync(bindingPath);
assert.deepEqual([...binding.subarray(0, 4)], [127, 69, 76, 70], 'Binding is not ELF');
assert.equal(binding[4], 2, 'Expected a 64-bit binding');
assert.equal(binding[5], 1, 'Expected little-endian ELF');
const expectedMachine = architecture === 'arm64' ? 183 : 62;
assert.equal(binding.readUInt16LE(18), expectedMachine, 'Binding machine differs from runtime');
const directory = mkdtempSync(path.join(os.tmpdir(), 'autoxpose-binding-'));
try {
  const invalid = Buffer.from(binding);
  invalid.writeUInt16LE(expectedMachine === 183 ? 62 : 183, 18);
  const target = path.join(directory, 'wrong-machine.node');
  writeFileSync(target, invalid);
  const code = `const Database = require('better-sqlite3');
    try { new Database(':memory:', { nativeBinding: process.argv[1] }); process.exitCode = 2; }
    catch (error) { if (error.code !== 'ERR_DLOPEN_FAILED') throw error; }`;
  const negative = spawnSync(process.execPath, ['-e', code, target], {
    cwd: '/app/packages/backend',
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(negative.status, 0, 'Corrupted binding was not rejected by the real loader');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    passed: true,
    platform: process.platform,
    architecture: process.arch,
    machine: expectedMachine,
    databaseWriteRead: true,
    transactionRollback: true,
    corruptedBindingRejected: true,
  })
);
