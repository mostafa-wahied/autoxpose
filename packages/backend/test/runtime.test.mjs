import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('compiled backend server module loads under Node ESM', async () => {
  const module = await import('../dist/server.js');
  assert.equal(typeof module.createServer, 'function');
});

test('legacy databases without migration tracking apply new migrations without data loss', context => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'autoxpose-migration-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const code = `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const Database = require('better-sqlite3');
    const filename = process.argv[1];
    const database = new Database(filename);
    const journal = JSON.parse(fs.readFileSync('migrations/meta/_journal.json'));
    for (const entry of journal.entries.slice(0, 2)) {
      database.exec(fs.readFileSync('migrations/' + entry.tag + '.sql', 'utf8'));
    }
    database.prepare('INSERT INTO services (id,name,subdomain,port,source,enabled,exposure_source) VALUES (?,?,?,?,?,?,?)')
      .run('saved','Saved','saved',8080,'docker',0,'paused');
    database.close();
    (async () => {
      const { getDatabase } = await import('./dist/core/database/index.js');
      getDatabase(filename);
      const current = new Database(filename);
      const record = current.prepare('SELECT * FROM services').get();
      assert.equal(record.source_name, null);
      assert.equal(record.exposure_source, 'paused');
      assert.equal(record.enabled, 0);
      assert.equal(current.prepare('SELECT COUNT(*) AS total FROM __drizzle_migrations').get().total, journal.entries.length);
      current.close();
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  execFileSync(process.execPath, ['-e', code, path.join(directory, 'legacy.db')], {
    cwd: new URL('..', import.meta.url),
    timeout: 15000,
    env: { ...process.env, LOG_LEVEL: 'fatal' },
    stdio: 'pipe',
  });
});
