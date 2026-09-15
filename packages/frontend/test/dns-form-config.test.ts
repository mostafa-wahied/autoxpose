import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSaveDnsConfig,
  getSavedDnsCredentials,
  type DnsFormValues,
} from '../src/components/terminal/config/dns-form-config';

const emptyValues: DnsFormValues = {
  token: '',
  zoneId: '',
  domain: 'example.com',
  apiKey: '',
  secretKey: '',
  accessKeyId: '',
  accessKeySecret: '',
  secretId: '',
  dnspodSecretKey: '',
};

test('switching providers requires the new provider credential pair', () => {
  const saved = getSavedDnsCredentials({
    configured: true,
    provider: 'cloudflare',
    domain: 'example.com',
    config: { token: 'saved', zoneId: 'zone' },
  });

  assert.equal(canSaveDnsConfig('dnspod', emptyValues, saved), false);
  assert.equal(canSaveDnsConfig('dnspod', { ...emptyValues, secretId: 'id' }, saved), false);
  assert.equal(
    canSaveDnsConfig('dnspod', { ...emptyValues, secretId: 'id', dnspodSecretKey: 'key' }, saved),
    true
  );
  assert.equal(canSaveDnsConfig('netlify', emptyValues, saved), false);
});

test('editing a saved credential pair allows neither field or both fields', () => {
  const saved = getSavedDnsCredentials({
    configured: true,
    provider: 'aliyun',
    domain: 'example.com',
    config: { accessKeyId: 'saved-id', accessKeySecret: 'saved-secret' },
  });

  assert.equal(canSaveDnsConfig('aliyun', emptyValues, saved), true);
  assert.equal(
    canSaveDnsConfig('aliyun', { ...emptyValues, accessKeySecret: 'new-secret' }, saved),
    false
  );
  assert.equal(
    canSaveDnsConfig(
      'aliyun',
      { ...emptyValues, accessKeyId: 'new-id', accessKeySecret: 'new-secret' },
      saved
    ),
    true
  );
});
