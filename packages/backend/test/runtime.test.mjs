import assert from 'node:assert/strict';
import test from 'node:test';

test('compiled backend server module loads under Node ESM', async () => {
  const module = await import('../dist/server.js');
  assert.equal(typeof module.createServer, 'function');
});
