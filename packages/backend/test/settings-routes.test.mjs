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
