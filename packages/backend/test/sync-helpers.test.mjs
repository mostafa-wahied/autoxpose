import assert from 'node:assert/strict';
import test from 'node:test';
import { findMatchingDnsRecord } from '../dist/features/services/sync-helpers.js';

const service = { subdomain: 'app', name: 'app', port: 8080 };

test('DNS matching ignores inactive records and preserves existing provider behavior', () => {
  const inactive = {
    id: 'inactive',
    hostname: 'app.example.com',
    type: 'A',
    value: '192.0.2.1',
    ttl: 600,
    active: false,
  };
  const active = { ...inactive, id: 'active', active: true };
  const legacy = { ...inactive, id: 'legacy', active: undefined };

  assert.equal(findMatchingDnsRecord(service, [inactive], 'example.com'), undefined);
  assert.equal(findMatchingDnsRecord(service, [active], 'example.com')?.id, 'active');
  assert.equal(findMatchingDnsRecord(service, [legacy], 'example.com')?.id, 'legacy');
});
