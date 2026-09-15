import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { closeDatabase, getDatabase } from '../dist/core/database/index.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

function journal() {
  const raw = readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf-8');
  return JSON.parse(raw)
    .entries.slice()
    .sort((a, b) => a.idx - b.idx);
}

function applyMigration(db, tag) {
  const sql = readFileSync(join(migrationsDir, `${tag}.sql`), 'utf-8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) db.exec(statement);
  }
}

/** A database as the previous release left it: every migration before ours. */
function createPreAccessListDatabase(path, { tracked }) {
  const db = new Database(path);
  db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at INTEGER
  )`);

  for (const entry of journal().filter(e => e.tag !== '0003_access_lists')) {
    applyMigration(db, entry.tag);
    if (tracked) {
      db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
        entry.tag,
        entry.when
      );
    }
  }

  db.prepare(
    `INSERT INTO services (id, name, subdomain, port, source) VALUES ('svc-1', 'grafana', 'grafana', 3000, 'docker')`
  ).run();
  db.close();
}

function columns(path, table) {
  const db = new Database(path, { readonly: true });
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  db.close();
  return rows.map(r => r.name);
}

function tables(path) {
  const db = new Database(path, { readonly: true });
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all();
  db.close();
  return rows.map(r => r.name);
}

function appliedMigrations(path) {
  const db = new Database(path, { readonly: true });
  const rows = db
    .prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')
    .all();
  db.close();
  return rows;
}

function workspace(context) {
  const dir = mkdtempSync(join(tmpdir(), 'autoxpose-migrations-'));
  context.after(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test('journal timestamps increase so no migration is silently skipped', () => {
  const entries = journal();
  for (let i = 1; i < entries.length; i++) {
    assert.ok(
      entries[i].when > entries[i - 1].when,
      `${entries[i].tag} (when=${entries[i].when}) must be newer than ${entries[i - 1].tag} (when=${entries[i - 1].when})`
    );
  }
});

test('access list migration upgrades a tracked database from the previous release', context => {
  const path = join(workspace(context), 'tracked.db');
  createPreAccessListDatabase(path, { tracked: true });

  getDatabase(path);
  closeDatabase();

  assert.ok(tables(path).includes('npm_access_lists'), 'npm_access_lists table was created');
  const serviceColumns = columns(path, 'services');
  assert.ok(serviceColumns.includes('access_list_id'), 'services.access_list_id was added');
  assert.ok(serviceColumns.includes('access_list_name'), 'services.access_list_name was added');
});

test('a second startup applies nothing further', context => {
  const path = join(workspace(context), 'restart.db');
  createPreAccessListDatabase(path, { tracked: true });

  getDatabase(path);
  closeDatabase();
  const first = appliedMigrations(path);

  getDatabase(path);
  closeDatabase();
  const second = appliedMigrations(path);

  assert.deepEqual(second, first);
  assert.equal(second.length, journal().length);
});

test('a legacy database without migration tracking recovers and upgrades', context => {
  const path = join(workspace(context), 'legacy.db');
  createPreAccessListDatabase(path, { tracked: false });
  const raw = new Database(path);
  raw.exec('DROP TABLE __drizzle_migrations');
  raw.close();

  getDatabase(path);
  closeDatabase();

  assert.ok(tables(path).includes('npm_access_lists'), 'npm_access_lists table was created');
  assert.ok(columns(path, 'services').includes('access_list_id'));

  // Recovery must not backdate future migrations out of existence: the marker
  // rows carry the journal timestamps, not the wall clock.
  const entries = journal();
  const applied = appliedMigrations(path);
  assert.equal(applied.length, entries.length);
  for (const row of applied) {
    assert.ok(
      row.created_at <= entries[entries.length - 1].when,
      `migration recorded with a journal timestamp, got ${row.created_at}`
    );
  }
});

test('existing rows survive the access list migration', context => {
  const path = join(workspace(context), 'data.db');
  createPreAccessListDatabase(path, { tracked: true });

  getDatabase(path);
  closeDatabase();

  const db = new Database(path, { readonly: true });
  const row = db.prepare('SELECT name, access_list_id FROM services WHERE id = ?').get('svc-1');
  db.close();
  assert.deepEqual(row, { name: 'grafana', access_list_id: null });
});
