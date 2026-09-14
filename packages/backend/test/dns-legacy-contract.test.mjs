import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { CloudflareDnsProvider } from '../dist/features/dns/providers/cloudflare.js';
import { NetlifyDnsProvider } from '../dist/features/dns/providers/netlify.js';
import { DigitalOceanDnsProvider } from '../dist/features/dns/providers/digitalocean.js';
import { PorkbunDnsProvider } from '../dist/features/dns/providers/porkbun.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const config = {
  token: 'synthetic-token',
  zoneId: 'zone',
  domain: 'example.test',
  apiKey: 'synthetic-key',
  secretKey: 'synthetic-secret',
};
const record = {
  id: 'owned',
  name: 'demo.example.test',
  hostname: 'demo.example.test',
  type: 'A',
  content: '192.0.2.1',
  value: '192.0.2.1',
  data: '192.0.2.1',
  ttl: 600,
};
const providers = [
  {
    Provider: CloudflareDnsProvider,
    response: { success: true, result: record },
    list: { success: true, result: [record] },
    error: { success: false, errors: [{ message: 'denied' }] },
  },
  { Provider: NetlifyDnsProvider, response: record, list: [record], error: { message: 'denied' } },
  {
    Provider: DigitalOceanDnsProvider,
    response: { domain_record: { ...record, name: 'demo' } },
    list: { domain_records: [{ ...record, name: 'demo' }] },
    error: { message: 'denied' },
  },
  {
    Provider: PorkbunDnsProvider,
    response: { status: 'SUCCESS', id: 'owned' },
    list: { status: 'SUCCESS', records: [record] },
    error: { status: 'ERROR', message: 'Invalid API key' },
  },
];

test('Cloudflare and DigitalOcean retrieve later pages and reject truncated inventories', async () => {
  for (const Provider of [CloudflareDnsProvider, DigitalOceanDnsProvider]) {
    const provider = new Provider(config);
    const pages = [];
    let truncate = false;
    globalThis.fetch = async input => {
      const page = Number(new URL(input).searchParams.get('page') || 1);
      pages.push(page);
      const records =
        page === 1
          ? [{ ...record, id: 'first', name: 'first.example.test' }]
          : truncate
            ? []
            : [record];
      return Provider === CloudflareDnsProvider
        ? json({ success: true, result: records, result_info: { total_pages: 2, total_count: 2 } })
        : json({
            domain_records: records,
            meta: { total: 2 },
            links: {
              pages:
                page === 1
                  ? { next: 'https://api.digitalocean.com/v2/domains/example.test/records?page=2' }
                  : {},
            },
          });
    };
    const records = await provider.listRecords();
    assert.equal(records.length, 2);
    assert.deepEqual(pages, [1, 2]);
    truncate = true;
    await assert.rejects(provider.listRecords(), /incomplete|empty/i);
  }
});

for (const definition of providers) {
  test(`${definition.Provider.name} preserves record fields, exact deletion target and short-name lookup`, async () => {
    const provider = new definition.Provider(config);
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return json(definition.response);
    };
    const created = await provider.createRecord({
      subdomain: 'demo',
      ip: '192.0.2.1',
      type: 'A',
      ttl: 600,
    });
    assert.equal(created.id, 'owned');
    assert.equal(created.hostname, 'demo.example.test');
    assert.equal(created.value, '192.0.2.1');
    assert.equal(created.ttl, 600);
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(Number(payload.ttl), 600);
    globalThis.fetch = async () => json(definition.list);
    assert.equal((await provider.findByHostname('demo'))?.id, 'owned');
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      return provider.name === 'cloudflare'
        ? json({ success: true })
        : provider.name === 'porkbun'
          ? json({ status: 'SUCCESS' })
          : new Response(null, { status: 204 });
    };
    await provider.deleteRecord('owned');
    assert.ok(calls.at(-1).url.endsWith('/owned'));
    assert.equal(calls.at(-1).options.method, provider.name === 'porkbun' ? 'POST' : 'DELETE');
  });

  test(`${definition.Provider.name} propagates provider errors without reporting success`, async () => {
    const provider = new definition.Provider(config);
    for (const status of [401, 429, 503]) {
      globalThis.fetch = async () => json(definition.error, status);
      await assert.rejects(provider.listRecords());
      await assert.rejects(provider.createRecord({ subdomain: 'demo', ip: '192.0.2.1' }));
      await assert.rejects(provider.deleteRecord('owned'));
    }
  });
}
