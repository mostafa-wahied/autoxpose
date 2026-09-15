import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../dist/core/database/schema.js';
import { AccessListService } from '../dist/features/access-lists/access-list.service.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const FAMILY = { id: 2, name: 'Family', satisfy_any: false, pass_auth: true };
const ADMINS = { id: 3, name: 'Admins', satisfy_any: false, pass_auth: true };

function createDatabase() {
  const connection = new Database(':memory:');
  const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf-8'));
  for (const entry of journal.entries.slice().sort((a, b) => a.idx - b.idx)) {
    const sql = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf-8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) connection.exec(statement);
    }
  }
  return drizzle(connection, { schema });
}

function npmSettings(provider = 'npm') {
  return { getProxyConfig: async () => ({ provider, config: { url: 'http://npm.local' } }) };
}

function createService(lists, provider = 'npm') {
  return new AccessListService(createDatabase(), npmSettings(provider), async () => ({
    listAccessLists: async () => lists,
  }));
}

async function syncedService(lists, provider = 'npm') {
  const service = createService(lists, provider);
  await service.syncFromProvider();
  return service;
}

/** Records every write so tests can assert on what NPM was actually told. */
function fakeProxy(host) {
  const updates = [];
  let current = host;
  return {
    updates,
    async updateHost(hostId, input) {
      updates.push({ hostId, input });
      current = { ...current, accessListId: input.accessListId ?? current.accessListId };
      return current;
    },
  };
}

function existingHost(accessListId) {
  return {
    id: '7',
    domain: 'grafana.example.com',
    targetHost: '10.0.0.5',
    targetPort: 3000,
    ssl: true,
    enabled: true,
    accessListId,
  };
}

test('an exact name resolves to its NPM id', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  assert.deepEqual(await service.resolve('Family'), { kind: 'resolved', id: 2, name: 'Family' });
});

test('a missing label means "leave the protection alone"', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  assert.deepEqual(await service.resolve(null), { kind: 'unset' });
});

test('the reserved value public is an explicit removal', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  assert.deepEqual(await service.resolve('public'), { kind: 'public' });
  assert.deepEqual(await service.resolve('Public'), { kind: 'public' });
});

test('a near miss is rejected instead of falling back to public', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  const result = await service.resolve('family');
  assert.equal(result.kind, 'error');
  assert.match(result.message, /not found/);
});

test('validation failure lists the valid NPM names', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  const result = await service.resolve('Nope');
  assert.equal(result.kind, 'error');
  assert.match(result.message, /Admins, Family/);
});

test('a duplicated name is rejected rather than guessed', async () => {
  const service = await syncedService([FAMILY, { ...ADMINS, id: 9, name: 'Family' }]);
  const result = await service.resolve('Family');
  assert.equal(result.kind, 'error');
  assert.match(result.message, /ambiguous/);
});

test('access lists are rejected when the proxy provider is not NPM', async () => {
  const service = createService([FAMILY], 'caddy');
  const result = await service.resolve('Family');
  assert.equal(result.kind, 'error');
  assert.match(result.message, /Nginx Proxy Manager/);
});

test('creating a host with an unknown access list throws, blocking exposure', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  await assert.rejects(
    () => service.accessListIdForCreate({ accessListName: 'Ghost' }),
    /not found/
  );
});

test('a host is created without an access list only when none was requested', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  assert.equal(await service.accessListIdForCreate({ accessListName: null }), undefined);
  assert.equal(await service.accessListIdForCreate({ accessListName: 'public' }), undefined);
  assert.equal(await service.accessListIdForCreate({ accessListName: 'Admins' }), 3);
});

test('reconcile adds an access list to a host that is currently public', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  const host = existingHost();
  const proxy = fakeProxy(host);

  const result = await service.reconcileProxyHost({ accessListName: 'Family' }, host, proxy);

  assert.deepEqual(proxy.updates, [{ hostId: '7', input: { accessListId: 2 } }]);
  assert.equal(result.accessListId, 2);
});

test('reconcile changes the access list when the label points elsewhere', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  const host = existingHost(2);
  const proxy = fakeProxy(host);

  const result = await service.reconcileProxyHost({ accessListName: 'Admins' }, host, proxy);

  assert.deepEqual(proxy.updates, [{ hostId: '7', input: { accessListId: 3 } }]);
  assert.equal(result.accessListId, 3);
});

test('reconcile removes the access list when the label is set to public', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  const host = existingHost(3);
  const proxy = fakeProxy(host);

  const result = await service.reconcileProxyHost({ accessListName: 'public' }, host, proxy);

  assert.deepEqual(proxy.updates, [{ hostId: '7', input: { accessListId: 0 } }]);
  assert.equal(result.accessListId, null);
});

test('reconcile preserves the current protection when the label is removed', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  const host = existingHost(3);
  const proxy = fakeProxy(host);

  const result = await service.reconcileProxyHost({ accessListName: null }, host, proxy);

  assert.deepEqual(proxy.updates, []);
  assert.equal(result.accessListId, 3);
});

test('reconcile does not write to NPM when the host is already correct', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  const host = existingHost(2);
  const proxy = fakeProxy(host);

  const result = await service.reconcileProxyHost({ accessListName: 'Family' }, host, proxy);

  assert.deepEqual(proxy.updates, []);
  assert.equal(result.accessListId, 2);
});

test('reconcile reports the real NPM state when the name is unknown', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  const host = existingHost(3);
  const proxy = fakeProxy(host);

  const result = await service.reconcileProxyHost({ accessListName: 'Ghost' }, host, proxy);

  assert.deepEqual(proxy.updates, []);
  assert.equal(result.accessListId, 3, 'the host keeps the protection NPM actually enforces');
  assert.match(result.error ?? '', /not found/);
});

test('reconcile reports the real NPM state when the update call fails', async () => {
  const service = await syncedService([FAMILY, ADMINS]);
  const host = existingHost(3);
  const proxy = fakeProxy(host);
  proxy.updateHost = async () => {
    throw new Error('NPM unreachable');
  };

  const result = await service.reconcileProxyHost({ accessListName: 'Family' }, host, proxy);

  assert.equal(result.accessListId, 3);
  assert.match(result.error ?? '', /NPM unreachable/);
});

test('a sync failure is reported instead of a successful zero', async () => {
  const failing = new AccessListService(createDatabase(), npmSettings(), async () => ({
    listAccessLists: async () => {
      throw new Error('401 Unauthorized');
    },
  }));

  assert.deepEqual(await failing.syncFromProvider(), {
    ok: false,
    synced: 0,
    error: '401 Unauthorized',
  });
});

test('services referencing a list deleted in NPM are cleared', async () => {
  const db = createDatabase();
  let lists = [FAMILY, ADMINS];
  const service = new AccessListService(db, npmSettings(), async () => ({
    listAccessLists: async () => lists,
  }));
  await service.syncFromProvider();

  await db.insert(schema.services).values({
    id: 'svc-1',
    name: 'grafana',
    subdomain: 'grafana',
    port: 3000,
    source: 'docker',
    accessListName: 'Admins',
    accessListId: 3,
  });

  lists = [FAMILY];
  await service.syncFromProvider();

  const rows = await db.select().from(schema.services);
  assert.equal(rows[0].accessListId, null, 'the stale reference is cleared');
  assert.equal(rows[0].accessListName, 'Admins', 'the label is still what the user asked for');
  assert.deepEqual(
    (await service.getAll()).map(l => l.id),
    [2]
  );
});

test('cached lists are dropped when the proxy configuration changes', async () => {
  const db = createDatabase();
  const service = new AccessListService(db, npmSettings('caddy'), async () => null);
  await db.insert(schema.npmAccessLists).values({ id: 2, name: 'Family' });
  await db.insert(schema.services).values({
    id: 'svc-1',
    name: 'grafana',
    subdomain: 'grafana',
    port: 3000,
    source: 'docker',
    accessListId: 2,
  });

  await service.onProxyConfigChanged();

  assert.deepEqual(await service.getAll(), []);
  const rows = await db.select().from(schema.services);
  assert.equal(rows[0].accessListId, null);
});
