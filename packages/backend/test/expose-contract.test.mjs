import assert from 'node:assert/strict';
import test from 'node:test';
import { ExposeService } from '../dist/features/expose/expose.service.js';
import { StreamingExposeService } from '../dist/features/expose/streaming-expose.service.js';
import { SyncService } from '../dist/features/services/sync.service.js';

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
