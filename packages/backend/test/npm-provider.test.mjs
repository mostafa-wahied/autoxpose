import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { NpmProxyProvider } from '../dist/features/proxy/providers/npm.js';
import { waitForNpmRoute } from '../../../scripts/proxy-contracts.mjs';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const original = {
  id: 71,
  domain_names: ['demo.example.test'],
  forward_host: 'upstream',
  forward_port: 8080,
  forward_scheme: 'http',
  allow_websocket_upgrade: false,
  block_exploits: false,
  access_list_id: 9,
  certificate_id: 12,
  ssl_forced: true,
  http2_support: false,
  hsts_enabled: true,
  hsts_subdomains: true,
  meta: { preserved: 'value' },
  advanced_config: 'proxy_read_timeout 70s;',
  locations: [{ path: '/private', forward_port: 8081 }],
  caching_enabled: true,
  enabled: true,
};

test('NPM edit and deletion preserve unrelated configuration and target exact host IDs', async () => {
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const pathname = new URL(input).pathname;
    const body = options.body && JSON.parse(options.body);
    calls.push({ pathname, method: options.method || 'GET', body });
    if (pathname === '/api/tokens') return Response.json({ token: 'synthetic-session' });
    assert.equal(options.headers.Authorization, 'Bearer synthetic-session');
    if (options.method === 'PUT') return Response.json({ ...body, id: 71, enabled: true });
    if (options.method === 'DELETE') return Response.json(true);
    return Response.json(original);
  };
  const provider = new NpmProxyProvider({
    url: 'http://npm:81',
    username: 'owner',
    password: 'synthetic-password',
  });
  const updated = await provider.updateHost('71', { targetHost: 'new-upstream', targetPort: 9090 });
  assert.equal(updated.targetHost, 'new-upstream');
  assert.equal(updated.targetPort, 9090);
  const update = calls.find(call => call.method === 'PUT');
  assert.equal(update.pathname, '/api/nginx/proxy-hosts/71');
  for (const [key, value] of Object.entries(original)) {
    if (!['id', 'enabled', 'forward_host', 'forward_port'].includes(key))
      assert.deepEqual(update.body[key], value, key);
  }
  await provider.deleteHost('71');
  assert.equal(calls.at(-1).pathname, '/api/nginx/proxy-hosts/71');
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.equal(calls.filter(call => call.pathname === '/api/tokens').length, 1);
});

test('NPM provider failure does not become a successful edit or delete', async () => {
  for (const status of [401, 429, 503]) {
    globalThis.fetch = async () => Response.json({ error: 'synthetic failure' }, { status });
    const provider = new NpmProxyProvider({
      url: 'http://npm:81',
      username: 'owner',
      password: 'synthetic-password',
    });
    await assert.rejects(provider.listHosts());
    await assert.rejects(provider.updateHost('71', { targetPort: 9090 }));
    await assert.rejects(provider.deleteHost('71'));
  }
});

test('NPM routing waits for reload while requiring the exact response and virtual host', async () => {
  let requests = 0;
  const lab = {
    request: async (port, route, options) => {
      assert.equal(port, 80);
      assert.equal(route, '/_ping');
      assert.equal(options.headers.Host, 'route.example.test');
      requests += 1;
      return { status: 200, text: requests === 1 ? 'Default Site' : 'OK' };
    },
  };
  await waitForNpmRoute(lab, 80, '/_ping', 'route.example.test', 'OK', 1000);
  assert.equal(requests, 2);
});

test('NPM routing rejects a permanently incorrect response or failed HTTP status', async () => {
  for (const response of [
    { status: 200, text: 'Default Site' },
    { status: 502, text: 'OK' },
  ]) {
    await assert.rejects(
      waitForNpmRoute({ request: async () => response }, 80, '/', 'route.example.test', 'OK', 20),
      /did not return the expected response before the reload deadline/
    );
  }
});
