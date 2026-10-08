import assert from 'node:assert/strict';
import test from 'node:test';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { AccessListService } from '../dist/features/access-lists/access-list.service.js';
import { handleProxyExpose } from '../dist/features/expose/expose-handlers.js';
import { createInitialSteps } from '../dist/features/expose/progress.types.js';
import { ExposeService } from '../dist/features/expose/expose.service.js';
import { StreamingExposeService } from '../dist/features/expose/streaming-expose.service.js';
import { SyncService } from '../dist/features/services/sync.service.js';

test('existing proxy paths enforce requested protection before reporting success', async context => {
  const originalRequest = https.request;
  context.after(() => {
    https.request = originalRequest;
  });
  https.request = (_options, callback) => {
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => callback({ statusCode: 200 }));
    request.destroy = () => {};
    return request;
  };
  for (const mode of [
    'saved-unknown',
    'failed-update',
    'wrong-saved-id',
    'ambiguous',
    'saved',
    'existing',
  ]) {
    const host = { id: 'host', domain: 'demo.example.test', targetPort: 8080, accessListId: 0 };
    const saved = [];
    const events = [];
    let updates = 0;
    const proxy = {
      findByDomain: async () => host,
      listHosts: async () => (mode === 'ambiguous' ? [host, { ...host, id: 'duplicate' }] : [host]),
      updateHost: async (_id, change) => {
        updates += 1;
        if (mode === 'failed-update') throw new Error('NPM rejected update');
        Object.assign(host, change);
        return host;
      },
    };
    const accessLists = new AccessListService(null, {});
    accessLists.resolve = async () =>
      mode === 'saved-unknown'
        ? { kind: 'error', message: 'Unknown requested list' }
        : { kind: 'resolved', id: 2, name: 'Family' };
    const service = {
      ...initialRecord(),
      accessListName: 'Family',
      proxyHostId: mode === 'wrong-saved-id' ? 'other' : mode.startsWith('saved') ? 'host' : null,
    };
    const result = await handleProxyExpose({
      ctx: {
        serviceId: 'demo',
        action: 'expose',
        steps: createInitialSteps('expose'),
        onProgress: event => events.push(event),
      },
      svc: service,
      fullDomain: host.domain,
      settings: { getProxyProvider: async () => proxy },
      lanIp: '192.0.2.1',
      accessLists,
      onHost: async (id, accessListId) => saved.push({ id, accessListId }),
    });
    if (mode === 'saved' || mode === 'existing') {
      assert.equal(result.id, 'host', mode);
      assert.deepEqual(saved, [{ id: 'host', accessListId: 2 }], mode);
      assert.equal(updates, 1, mode);
    } else {
      assert.equal(result, null, mode);
      assert.equal(events.at(-1).type, 'error', mode);
      assert.deepEqual(saved, [], mode);
    }
  }
});

test('non-streaming exposure verifies existing-host access lists without duplicating hosts', async () => {
  for (const mode of ['saved', 'existing', 'unknown', 'failed-update', 'wrong-id']) {
    const value = fixture();
    const host = { id: 'host', domain: 'demo.example.test', targetPort: 8080, accessListId: 0 };
    let writes = 0;
    const proxy = {
      listHosts: async () => [host],
      updateHost: async (_id, change) => {
        writes += 1;
        if (mode === 'failed-update') throw new Error('Rejected protection');
        Object.assign(host, change);
        return host;
      },
      createHost: async () => {
        throw new Error('Existing host must not be duplicated');
      },
    };
    const accessLists = new AccessListService(null, {});
    accessLists.resolve = async () =>
      mode === 'unknown'
        ? { kind: 'error', message: 'Unknown access list' }
        : { kind: 'resolved', id: 2, name: 'Family' };
    value.expose.context.accessLists = accessLists;
    value.settings.getProxyProvider = async () => proxy;
    value.settings.isWildcardMode = async () => true;
    await value.repo.update('demo', {
      accessListName: 'Family',
      accessListId: null,
      proxyHostId: mode === 'existing' ? null : mode === 'wrong-id' ? 'other' : 'host',
    });
    if (mode === 'saved' || mode === 'existing') {
      await value.expose.expose('demo');
      assert.equal(writes, 1, mode);
      assert.equal(value.record().accessListId, 2, mode);
    } else {
      await assert.rejects(value.expose.expose('demo'));
      assert.equal(value.record().enabled, false, mode);
    }
  }
});

function initialRecord() {
  return {
    id: 'demo',
    subdomain: 'demo',
    name: 'demo',
    port: 8080,
    scheme: 'http',
    enabled: false,
    dnsRecordId: null,
    proxyHostId: null,
    exposureSource: null,
    source: 'manual',
    sourceId: null,
  };
}

function fixture() {
  let record = initialRecord();
  const calls = [];
  const failure = { proxyCreate: false, dnsDelete: false, proxyDelete: false };
  const repo = {
    findById: async () => ({ ...record }),
    findAll: async () => [{ ...record }],
    update: async (_id, values) => {
      record = { ...record, ...values };
      return { ...record };
    },
  };
  const dns = {
    createRecord: async () => {
      calls.push('create-dns');
      return { id: 'dns-created' };
    },
    deleteRecord: async () => {
      calls.push('delete-dns');
      if (failure.dnsDelete) throw new Error('DNS unavailable');
    },
    listRecords: async () => [
      { id: 'dns-created', hostname: 'demo.example.test', type: 'A', value: '192.0.2.1' },
    ],
    findByHostname: async () => ({ id: 'dns-created' }),
  };
  const proxy = {
    createHost: async () => {
      calls.push('create-proxy');
      if (failure.proxyCreate) throw new Error('Proxy unavailable');
      return { id: 'proxy-created', sslPending: true };
    },
    deleteHost: async () => {
      calls.push('delete-proxy');
      if (failure.proxyDelete) throw new Error('Proxy unavailable');
    },
    listHosts: async () => [
      {
        id: 'proxy-created',
        domain: 'demo.example.test',
        targetPort: 8080,
        targetHost: '192.0.2.1',
        enabled: true,
      },
    ],
    findByDomain: async () => ({
      id: 'proxy-created',
      domain: 'demo.example.test',
      targetPort: 8080,
    }),
  };
  const settings = {
    getDnsProvider: async () => dns,
    getProxyProvider: async () => proxy,
    getBaseDomainFromAnySource: async () => 'example.test',
    isWildcardMode: async () => false,
    getWildcardConfig: async () => null,
  };
  const expose = new ExposeService({
    servicesRepo: repo,
    settings,
    publicIp: '192.0.2.1',
    lanIp: '192.0.2.1',
  });
  expose.determineScheme = async () => 'http';
  return { expose, repo, settings, failure, calls, record: () => ({ ...record }) };
}

test('partial exposure preserves the created resource and retries without duplicating it', async () => {
  const value = fixture();
  value.failure.proxyCreate = true;
  await assert.rejects(value.expose.expose('demo'), /Proxy unavailable/);
  assert.equal(value.record().dnsRecordId, 'dns-created');
  assert.equal(value.record().enabled, false);
  value.failure.proxyCreate = false;
  await value.expose.expose('demo');
  await value.expose.expose('demo');
  assert.deepEqual(value.calls, ['create-dns', 'create-proxy', 'create-proxy']);
  assert.equal(value.record().enabled, true);
});

test('Stop preserves failed resource IDs and clears only confirmed deletions', async () => {
  const value = fixture();
  await value.expose.expose('demo');
  value.failure.proxyDelete = true;
  await assert.rejects(value.expose.unexpose('demo'), /Proxy unavailable/);
  assert.equal(value.record().dnsRecordId, null);
  assert.equal(value.record().proxyHostId, 'proxy-created');
  assert.equal(value.record().exposureSource, 'paused');
  value.failure.proxyDelete = false;
  await value.expose.unexpose('demo');
  assert.equal(value.calls.filter(call => call === 'delete-dns').length, 1);
  assert.equal(value.record().proxyHostId, null);
  assert.equal(value.record().enabled, false);
});

test('paused state survives automatic and explicit synchronization until Start', async () => {
  const value = fixture();
  await value.expose.expose('demo');
  await value.expose.unexpose('demo');
  const sync = new SyncService(value.repo, value.settings);
  await sync.detectExistingConfigurations([value.record()]);
  await sync.syncService(value.record());
  await sync.syncAll([value.record()]);
  assert.equal(value.record().exposureSource, 'paused');
  assert.equal(value.record().enabled, false);
  await value.expose.expose('demo');
  assert.equal(value.record().enabled, true);
  assert.equal(value.record().exposureSource, 'manual');
});

test('streaming Stop reports unavailable providers as errors without discarding IDs', async () => {
  const value = fixture();
  await value.expose.expose('demo');
  value.settings.getDnsProvider = async () => null;
  value.settings.getProxyProvider = async () => null;
  const stream = new StreamingExposeService(value.repo, value.settings, '192.0.2.1', '192.0.2.1');
  const events = [];
  await stream.unexposeWithProgress('demo', event => events.push(event));
  assert.equal(events.at(-1).type, 'error');
  assert.equal(
    events.some(event => event.type === 'complete'),
    false
  );
  assert.equal(value.record().dnsRecordId, 'dns-created');
  assert.equal(value.record().proxyHostId, 'proxy-created');
  assert.equal(value.record().exposureSource, 'paused');
});
