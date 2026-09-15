import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from '../dist/server.js';

async function fixture(context, origins) {
  const previous = process.env.CORS_ORIGIN;
  if (origins === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = origins;
  let writes = 0;
  const server = await createServer(
    {},
    {
      settings: {
        clearAllConfig: async () => {
          writes += 1;
          return 1;
        },
      },
      servicesRepo: {
        deleteAll: async () => {
          writes += 1;
          return 1;
        },
      },
    }
  );
  context.after(async () => {
    await server.close();
    if (previous === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previous;
  });
  return { server, writes: () => writes };
}

test('untrusted browser origins cannot mutate settings or services', async context => {
  const { server, writes } = await fixture(context);
  for (const origin of [
    'https://unrelated.example',
    'null',
    'http://dashboard:4949.evil.test',
    'file://dashboard',
  ]) {
    const response = await server.inject({
      method: 'POST',
      url: '/api/settings/reset',
      headers: { host: 'dashboard:4949', origin },
    });
    assert.equal(response.statusCode, 403);
  }
  assert.equal(writes(), 0);
});

test('same-origin and non-browser requests retain the trusted-network contract', async context => {
  const { server, writes } = await fixture(context);
  for (const headers of [
    { host: 'dashboard:4949' },
    { host: 'dashboard:4949', origin: 'http://dashboard:4949' },
    { host: 'app.example.test', origin: 'https://app.example.test', 'x-forwarded-proto': 'https' },
  ]) {
    assert.equal(
      (await server.inject({ method: 'POST', url: '/api/settings/reset', headers })).statusCode,
      200
    );
  }
  assert.equal(writes(), 6);
});

test('only exact explicitly configured cross-origins can mutate', async context => {
  const { server, writes } = await fixture(context, 'https://trusted.example');
  assert.equal(
    (
      await server.inject({
        method: 'POST',
        url: '/api/settings/reset',
        headers: { origin: 'https://trusted.example' },
      })
    ).statusCode,
    200
  );
  for (const origin of [
    'https://trusted.example.evil.test',
    'https://trusted.example:444',
    'http://trusted.example',
  ]) {
    assert.equal(
      (await server.inject({ method: 'POST', url: '/api/settings/reset', headers: { origin } }))
        .statusCode,
      403
    );
  }
  assert.equal(writes(), 2);
});
