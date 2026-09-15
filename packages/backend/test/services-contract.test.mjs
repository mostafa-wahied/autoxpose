import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { ServicesService } from '../dist/features/services/services.service.js';
import { createServicesRoutes } from '../dist/features/services/services.routes.js';
import {
  DockerDiscoveryProvider,
  createDiscoveryRoutes,
} from '../dist/features/discovery/docker.js';
import { SyncService } from '../dist/features/services/sync.service.js';

function repository(records = []) {
  const values = new Map(records.map(record => [record.id, structuredClone(record)]));
  return {
    values,
    findAll: async () => [...values.values()],
    findById: async id => values.get(id),
    findBySourceId: async sourceId =>
      [...values.values()].find(record => record.sourceId === sourceId),
    create: async input => {
      const item = { id: `service-${values.size}`, enabled: false, ...input };
      values.set(item.id, item);
      return item;
    },
    update: async (id, input) => {
      const item = values.get(id);
      Object.assign(item, input);
      return item;
    },
    delete: async id => values.delete(id),
  };
}

const service = {
  id: 'owned',
  sourceId: 'container',
  source: 'docker',
  name: 'demo',
  subdomain: 'demo',
  port: 8080,
  scheme: 'http',
  enabled: true,
  exposureSource: 'manual',
  dnsRecordId: 'dns-owned',
  proxyHostId: 'proxy-owned',
};

test('discovery failures are not reported as a successful empty inventory', async () => {
  const provider = new DockerDiscoveryProvider({ socketPath: '/unused-contract.sock' });
  provider.docker = {
    listContainers: async () => {
      throw new Error('Docker unavailable');
    },
  };
  await assert.rejects(provider.discover(), /Docker unavailable/);
});

test('discovery is idempotent and keeps exposed state across incomplete inventories', async () => {
  const repo = repository([service]);
  const services = new ServicesService(repo);
  const discovered = {
    id: 'new-container',
    source: 'docker',
    name: 'new',
    subdomain: 'new',
    port: 8081,
    scheme: 'http',
    labels: {},
    image: 'demo',
    autoExpose: false,
  };
  await services.syncFromDiscovery([discovered, discovered]);
  assert.equal(repo.values.size, 2);
  await services.syncFromDiscovery([discovered]);
  assert.equal(repo.values.size, 2);
  assert.deepEqual(repo.values.get('owned'), service);
  await services.syncFromDiscovery([]);
  assert.deepEqual(repo.values.get('owned'), service);
});

test('container recreation retains a paused service only with verified stable identity', async () => {
  const paused = {
    ...service,
    sourceName: 'actual-container',
    enabled: false,
    exposureSource: 'paused',
    tags: '["saved"]',
    hasExplicitSubdomainLabel: false,
  };
  for (const action of ['scan', 'event']) {
    const repo = repository([paused]);
    const inspected = [];
    const discovery = {
      containerExists: async identifier => {
        inspected.push(identifier);
        return false;
      },
    };
    const services = new ServicesService(repo, undefined, undefined, discovery);
    const replacement = {
      id: 'replacement',
      source: 'docker',
      sourceName: 'actual-container',
      name: 'demo',
      subdomain: 'demo',
      port: 8080,
      scheme: 'http',
      labels: {},
      image: 'demo',
      autoExpose: true,
    };
    if (action === 'scan') await services.syncFromDiscovery([replacement]);
    else assert.equal((await services.upsertService(replacement)).id, 'owned');
    assert.equal(repo.values.size, 1);
    assert.deepEqual(repo.values.get('owned'), { ...paused, sourceId: 'replacement' });
    assert.deepEqual(inspected, ['container']);
    assert.equal((await services.upsertService(replacement)).id, 'owned');
  }
});

test('container identity never adopts an ambiguous, still-existing or unverified record', async () => {
  const replacement = {
    id: 'replacement',
    source: 'docker',
    sourceName: 'actual-container',
    name: 'demo',
    subdomain: 'demo',
    port: 8080,
    scheme: 'http',
    labels: {},
    image: 'demo',
    autoExpose: false,
  };
  for (const mode of ['ambiguous', 'existing', 'unknown', 'display-name-only']) {
    const saved = {
      ...service,
      sourceName: mode === 'display-name-only' ? null : 'actual-container',
    };
    const records =
      mode === 'ambiguous' ? [saved, { ...saved, id: 'second', sourceId: 'other' }] : [saved];
    const repo = repository(records);
    const discovery =
      mode === 'unknown' ? undefined : { containerExists: async () => mode === 'existing' };
    await new ServicesService(repo, undefined, undefined, discovery).syncFromDiscovery([
      replacement,
    ]);
    assert.deepEqual(repo.values.get('owned'), saved, mode);
    assert.equal(repo.values.size, records.length + 1, mode);
  }
});

test('learning identity preserves tags without disabling ordinary discovery updates', async () => {
  for (const action of ['scan', 'event']) {
    const repo = repository([{ ...service, sourceName: null, tags: '["saved"]' }]);
    const services = new ServicesService(repo, undefined, { detectTags: () => ['updated'] });
    const discovered = {
      ...service,
      id: service.sourceId,
      sourceName: 'actual',
      labels: {},
      image: 'fixture',
      autoExpose: false,
    };
    const update = input =>
      action === 'scan' ? services.syncFromDiscovery([input]) : services.upsertService(input);
    await update(discovered);
    assert.equal(repo.values.get('owned').sourceName, 'actual');
    assert.equal(repo.values.get('owned').tags, '["saved"]');
    await update({ ...discovered, port: 8081 });
    assert.equal(repo.values.get('owned').tags, '["updated"]');
    assert.equal(repo.values.get('owned').port, 8081);
  }
});

test('cleanup preserves remaining resources after partial failure and retries only those resources', async context => {
  const repo = repository([service]);
  const calls = [];
  let failProxy = true;
  const settings = {
    getDnsProvider: async () => ({
      deleteRecord: async id => {
        calls.push(['dns', id]);
      },
    }),
    getProxyProvider: async () => ({
      deleteHost: async id => {
        calls.push(['proxy', id]);
        if (failProxy) throw new Error('Proxy unavailable');
      },
    }),
  };
  const services = new ServicesService(repo, settings);
  const server = Fastify();
  context.after(() => server.close());
  await server.register(createServicesRoutes({ services, settings }), { prefix: '/services' });
  const failed = await server.inject({ method: 'DELETE', url: '/services/owned/cleanup' });
  assert.equal(failed.statusCode, 502);
  assert.equal(failed.json().success, false);
  assert.equal(repo.values.has('owned'), true);
  assert.equal(repo.values.get('owned').dnsRecordId, null);
  assert.equal(repo.values.get('owned').proxyHostId, 'proxy-owned');
  failProxy = false;
  const retried = await server.inject({ method: 'DELETE', url: '/services/owned/cleanup' });
  assert.equal(retried.statusCode, 200);
  assert.equal(repo.values.has('owned'), false);
  assert.deepEqual(calls, [
    ['dns', 'dns-owned'],
    ['proxy', 'proxy-owned'],
    ['proxy', 'proxy-owned'],
  ]);
});

test('cleanup rejects adopted resources and unavailable providers without losing ownership', async context => {
  const repo = repository([service, { ...service, id: 'adopted', exposureSource: 'discovered' }]);
  const settings = { getDnsProvider: async () => null, getProxyProvider: async () => null };
  const server = Fastify();
  context.after(() => server.close());
  await server.register(
    createServicesRoutes({ services: new ServicesService(repo, settings), settings }),
    { prefix: '/services' }
  );
  assert.equal(
    (await server.inject({ method: 'DELETE', url: '/services/adopted/cleanup' })).statusCode,
    400
  );
  assert.equal(
    (await server.inject({ method: 'DELETE', url: '/services/owned/cleanup' })).statusCode,
    502
  );
  assert.equal(repo.values.size, 2);
  assert.deepEqual(repo.values.get('owned'), service);
});

test('failed provider snapshots cannot clear saved exposure or ownership state', async () => {
  const repo = repository([service]);
  const settings = {
    getDnsProvider: async () => ({
      listRecords: async () => {
        throw new Error('provider timeout');
      },
    }),
    getProxyProvider: async () => null,
    getBaseDomainFromAnySource: async () => 'example.test',
    getWildcardConfig: async () => null,
  };
  const sync = new SyncService(repo, settings);
  await assert.rejects(sync.detectExistingConfigurations([service]), /provider timeout/);
  assert.deepEqual(repo.values.get('owned'), service);
});

test('manual discovery scan does not auto-expose an explicitly paused service', async context => {
  const paused = {
    ...service,
    enabled: false,
    dnsRecordId: null,
    proxyHostId: null,
    exposureSource: 'paused',
  };
  const repo = repository([paused]);
  let calls = 0;
  const server = Fastify();
  context.after(() => server.close());
  await server.register(
    createDiscoveryRoutes({
      discovery: {
        discover: async () => [
          {
            id: service.sourceId,
            name: 'demo',
            subdomain: 'demo',
            port: 8080,
            scheme: 'http',
            labels: {},
            autoExpose: true,
          },
        ],
      },
      services: new ServicesService(repo),
      sync: { detectExistingConfigurations: async () => {} },
      streamingExpose: {
        exposeWithProgress: async () => {
          calls += 1;
        },
      },
    })
  );
  const response = await server.inject({ method: 'POST', url: '/scan' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().autoExposed, 0);
  assert.equal(calls, 0);
  assert.equal(repo.values.get('owned').exposureSource, 'paused');
});

test('invalid service inputs cannot create or mutate records', async context => {
  const repo = repository([service]);
  const server = Fastify();
  context.after(() => server.close());
  await server.register(createServicesRoutes({ services: new ServicesService(repo) }), {
    prefix: '/services',
  });
  for (const change of [
    { port: 0 },
    { port: 65536 },
    { port: 3.5 },
    { scheme: 'file' },
    { name: '' },
    { subdomain: '' },
  ]) {
    const created = await server.inject({
      method: 'POST',
      url: '/services',
      payload: { name: 'bad', subdomain: 'bad', port: 8080, ...change },
    });
    assert.equal(created.statusCode, 400);
    const updated = await server.inject({
      method: 'PATCH',
      url: '/services/owned',
      payload: change,
    });
    assert.equal(updated.statusCode, 400);
  }
  assert.equal(repo.values.size, 1);
  assert.deepEqual(repo.values.get('owned'), service);
});
