import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import Fastify from 'fastify';

process.env.LOG_LEVEL = 'fatal';

const { createSettingsRoutes } = await import('../dist/features/settings/settings.routes.js');
const { SettingsService } = await import('../dist/features/settings/settings.service.js');

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createTestServer(settings) {
  const server = Fastify();
  await server.register(createSettingsRoutes(settings, { deleteAll: async () => 0 }), {
    prefix: '/settings',
  });
  return server;
}

test('DNS settings are not persisted when required credentials are missing', async () => {
  let saved = false;
  const settings = {
    getMergedDnsConfig: async (_provider, config) => config,
    saveDnsConfig: async () => {
      saved = true;
    },
  };
  const server = await createTestServer(settings);

  const response = await server.inject({
    method: 'POST',
    url: '/settings/dns',
    payload: {
      provider: 'aliyun',
      config: { accessKeyId: 'id', accessKeySecret: '', domain: 'example.com' },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(saved, false);
  assert.match(response.json().error, /accessKeySecret/);
  await server.close();
});

test('DNS settings are not persisted when provider validation fails', async () => {
  globalThis.fetch = async () =>
    jsonResponse(
      {
        RequestId: 'request',
        Code: 'InvalidAccessKeyId.NotFound',
        Message: 'Specified access key is not found.',
      },
      404
    );
  let saved = false;
  const settings = {
    getMergedDnsConfig: async (_provider, config) => config,
    saveDnsConfig: async () => {
      saved = true;
    },
  };
  const server = await createTestServer(settings);

  const response = await server.inject({
    method: 'POST',
    url: '/settings/dns',
    payload: {
      provider: 'aliyun',
      config: {
        accessKeyId: 'invalid',
        accessKeySecret: 'invalid',
        domain: 'example.com',
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(saved, false);
  assert.match(response.json().error, /Invalid API credentials/);
  await server.close();
});

test('DNS settings are persisted after provider validation succeeds', async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      RequestId: 'request',
      TotalCount: 0,
      DomainRecords: { Record: [] },
    });
  let savedConfig;
  const settings = {
    getMergedDnsConfig: async (_provider, config) => config,
    saveDnsConfig: async (_provider, config) => {
      savedConfig = config;
    },
  };
  const server = await createTestServer(settings);
  const config = {
    accessKeyId: 'valid',
    accessKeySecret: 'valid',
    domain: 'example.com',
  };

  const response = await server.inject({
    method: 'POST',
    url: '/settings/dns',
    payload: { provider: 'aliyun', config },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(savedConfig, config);
  await server.close();
});

test('same-provider edits validate and save merged credentials', async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      RequestId: 'request',
      TotalCount: 0,
      DomainRecords: { Record: [] },
    });
  let validatedConfig;
  let savedConfig;
  const settings = {
    getMergedDnsConfig: async (_provider, config) => ({
      ...config,
      accessKeyId: config.accessKeyId || 'saved-id',
      accessKeySecret: config.accessKeySecret || 'saved-secret',
    }),
    saveDnsConfig: async (_provider, config) => {
      savedConfig = config;
    },
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    validatedConfig = new URL(String(input)).searchParams.get('AccessKeyId');
    return previousFetch(input, init);
  };
  const server = await createTestServer(settings);

  const response = await server.inject({
    method: 'POST',
    url: '/settings/dns',
    payload: {
      provider: 'aliyun',
      config: { accessKeyId: '', accessKeySecret: '', domain: 'new.example.com' },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(validatedConfig, 'saved-id');
  assert.deepEqual(savedConfig, {
    accessKeyId: 'saved-id',
    accessKeySecret: 'saved-secret',
    domain: 'new.example.com',
  });
  await server.close();
});

test('SettingsService restores saved credentials for same-provider edits', async () => {
  const repository = {
    getByType: async () => ({
      id: 'dns',
      type: 'dns',
      provider: 'aliyun',
      config: JSON.stringify({
        accessKeyId: 'saved-id',
        accessKeySecret: 'saved-secret',
        domain: 'example.com',
      }),
      createdAt: new Date(),
    }),
  };
  const settings = new SettingsService(repository);

  const merged = await settings.getMergedDnsConfig('aliyun', {
    accessKeyId: '',
    accessKeySecret: 'save••••cret',
    domain: 'new.example.com',
  });

  assert.deepEqual(merged, {
    accessKeyId: 'saved-id',
    accessKeySecret: 'saved-secret',
    domain: 'new.example.com',
  });
});

function proxySettings() {
  let current = {
    provider: 'npm',
    config: JSON.stringify({
      url: 'http://proxy:81',
      username: 'owner@example.test',
      password: 'saved-password',
    }),
  };
  const writes = [];
  const settings = new SettingsService({
    getByType: async () => current,
    save: async value => {
      writes.push(value);
      current = { provider: value.provider, config: JSON.stringify(value.config) };
    },
  });
  return { settings, writes, current: () => current };
}

test('invalid proxy credentials leave the working configuration unchanged', async context => {
  const fixture = proxySettings();
  const before = structuredClone(fixture.current());
  globalThis.fetch = async () => jsonResponse({ error: { message: 'Authentication failed' } }, 401);
  const server = await createTestServer(fixture.settings);
  context.after(() => server.close());
  const response = await server.inject({
    method: 'POST',
    url: '/settings/proxy',
    payload: {
      provider: 'npm',
      config: { url: 'http://proxy:81', username: 'new@example.test', password: 'wrong-password' },
    },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().success, false);
  assert.deepEqual(fixture.current(), before);
  assert.equal(fixture.writes.length, 0);
  assert.equal(response.body.includes('wrong-password'), false);
});

test('same-provider proxy edits validate merged credentials before saving', async context => {
  const fixture = proxySettings();
  const credentials = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(fixture.writes.length, 0, 'No persistence before validation finishes');
    if (String(url).endsWith('/tokens')) {
      credentials.push(JSON.parse(options.body));
      return jsonResponse({ token: 'synthetic-session', expires: '2099-01-01T00:00:00Z' });
    }
    return jsonResponse([]);
  };
  const server = await createTestServer(fixture.settings);
  context.after(() => server.close());
  const response = await server.inject({
    method: 'POST',
    url: '/settings/proxy',
    payload: {
      provider: 'npm',
      config: { url: 'http://new-proxy:81', username: '', password: '' },
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().validation.ok, true);
  assert.equal(credentials[0].identity, 'owner@example.test');
  assert.equal(credentials[0].secret, 'saved-password');
  assert.equal(fixture.writes.length, 1);
});

test('proxy validation rejects unknown providers, unsafe schemes and malformed values without requests', async context => {
  const fixture = proxySettings();
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return jsonResponse({});
  };
  const server = await createTestServer(fixture.settings);
  context.after(() => server.close());
  for (const payload of [
    { provider: 'unknown', config: { password: 'must-not-save' } },
    { provider: 'caddy', config: { url: 'file:///etc/passwd' } },
    { provider: 'caddy', config: { url: 'http://user:password@proxy:2019' } },
    { provider: 'caddy', config: { url: 123 } },
    { provider: 'caddy', config: [] },
  ]) {
    const response = await server.inject({ method: 'POST', url: '/settings/proxy', payload });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(fixture.writes.length, 0);
  assert.equal(requests, 0);
});

test('settings import validates all providers before replacing any saved configuration', async context => {
  const writes = [];
  const settings = {
    getMergedDnsConfig: async (_provider, config) => config,
    getMergedProxyConfig: async (_provider, config) => config,
    importProviderConfigs: async configs => {
      writes.push(configs);
    },
    saveDnsConfig: async () => {
      writes.push('dns');
    },
    saveProxyConfig: async () => {
      writes.push('proxy');
    },
  };
  globalThis.fetch = async () => jsonResponse({ success: true, result: [] });
  const server = await createTestServer(settings);
  context.after(() => server.close());
  const dns = {
    provider: 'cloudflare',
    config: { token: 'synthetic', zoneId: 'zone', domain: 'example.test' },
  };
  const proxy = { provider: 'caddy', config: { url: 'file:///invalid' } };
  const rejected = await server.inject({
    method: 'POST',
    url: '/settings/import',
    payload: { dns, proxy },
  });
  assert.equal(rejected.statusCode, 400);
  assert.deepEqual(writes, []);
  for (const payload of [
    null,
    { dns: { provider: 'cloudflare', config: [] } },
    { proxy: 'invalid' },
  ]) {
    assert.equal(
      (await server.inject({ method: 'POST', url: '/settings/import', payload })).statusCode,
      400
    );
  }
  const saved = await server.inject({
    method: 'POST',
    url: '/settings/import',
    payload: { dns, proxy: null },
  });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(writes, [[{ type: 'dns', ...dns }]]);
});

test('provider errors cannot echo submitted credentials into ordinary responses', async context => {
  const secret = 'synthetic-private-token-for-error-test';
  const settings = {
    getMergedDnsConfig: async (_provider, config) => config,
    saveDnsConfig: async () => assert.fail('Invalid credentials persisted'),
  };
  globalThis.fetch = async () => jsonResponse({ message: `Rejected token ${secret}` }, 503);
  const server = await createTestServer(settings);
  context.after(() => server.close());
  const response = await server.inject({
    method: 'POST',
    url: '/settings/dns',
    payload: {
      provider: 'netlify',
      config: { token: secret, zoneId: 'zone', domain: 'example.test' },
    },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.includes(secret), false);
});
