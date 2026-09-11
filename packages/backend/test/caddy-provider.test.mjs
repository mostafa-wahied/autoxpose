import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { CaddyProxyProvider } from '../dist/features/proxy/providers/caddy.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockCaddy(initialConfig, rejectLoad = false) {
  let config = structuredClone(initialConfig);
  const requests = [];
  globalThis.fetch = async (input, options = {}) => {
    const pathname = new URL(String(input)).pathname;
    const method = options.method || 'GET';
    requests.push({ pathname, method });
    if (pathname === '/config/' && method === 'GET') {
      return new Response(JSON.stringify(config), { status: 200 });
    }
    if (pathname === '/load' && method === 'POST') {
      if (rejectLoad) return new Response('Invalid configuration', { status: 500 });
      config = JSON.parse(options.body);
      return new Response('', { status: 200 });
    }
    if (pathname.startsWith('/id/') && method === 'DELETE') {
      const id = pathname.slice('/id/'.length);
      for (const server of Object.values(config.apps.http.servers)) {
        server.routes = (server.routes || []).filter(route => route['@id'] !== id);
      }
      return new Response('', { status: 200 });
    }
    throw new Error(`Unexpected Caddy request: ${method} ${pathname}`);
  };
  return { config: () => structuredClone(config), requests };
}

const input = { domain: 'demo.example.test', targetHost: '192.0.2.10', targetPort: 8080 };

test('Caddy create and delete preserve existing root, application, and server settings', async () => {
  const initial = {
    admin: { listen: '0.0.0.0:2019', enforce_origin: true },
    storage: { module: 'file_system', root: '/data/custom' },
    logging: { logs: { default: { level: 'WARN' } } },
    apps: {
      tls: { certificates: { automate: ['existing.example.test'] } },
      pki: { certificate_authorities: { local: { name: 'Local CA' } } },
      http: {
        http_port: 8088,
        servers: {
          primary: {
            listen: [':8088'],
            automatic_https: { disable: true },
            routes: [{ '@id': 'existing', handle: [{ handler: 'static_response', body: 'keep' }] }],
          },
          secondary: { listen: [':9090'], routes: [{ '@id': 'unrelated', terminal: true }] },
        },
      },
    },
  };
  const remote = mockCaddy(initial);
  const provider = new CaddyProxyProvider({ url: 'http://caddy:2019' });
  const created = await provider.createHost(input);
  const expected = structuredClone(initial);
  expected.apps.http.servers.primary.routes.unshift({
    '@id': created.id,
    match: [{ host: [input.domain] }],
    handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: '192.0.2.10:8080' }] }],
    terminal: true,
  });
  assert.deepEqual(remote.config(), expected);
  assert.equal((await provider.findByDomain(input.domain)).id, created.id);
  await provider.deleteHost(created.id);
  assert.deepEqual(remote.config(), initial);
  assert.equal(await provider.findByDomain(input.domain), null);
});

test('Caddy preserves default listeners when the selected server has none', async () => {
  const remote = mockCaddy({
    admin: { listen: ':2019' },
    apps: { http: { servers: { primary: {} } } },
  });
  await new CaddyProxyProvider({ url: 'http://caddy:2019' }).createHost(input);
  assert.deepEqual(remote.config().apps.http.servers.primary.listen, [':80', ':443']);
  assert.deepEqual(remote.config().admin, { listen: ':2019' });
  assert.equal(remote.config().apps.tls, undefined);
});

test('Caddy rejects missing servers and propagates reload failures', async () => {
  const empty = mockCaddy({ admin: { listen: ':2019' } });
  const provider = new CaddyProxyProvider({ url: 'http://caddy:2019' });
  await assert.rejects(provider.createHost(input), /No HTTP servers found/);
  assert.equal(
    empty.requests.some(request => request.pathname === '/load'),
    false
  );
  const initial = { admin: { listen: ':2019' }, apps: { http: { servers: { primary: {} } } } };
  const rejected = mockCaddy(initial, true);
  await assert.rejects(provider.createHost(input), /Server error/);
  assert.deepEqual(rejected.config(), initial);
});
