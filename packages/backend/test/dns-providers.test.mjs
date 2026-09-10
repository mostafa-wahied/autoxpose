import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { afterEach, test } from 'node:test';
import { AliyunDnsProvider } from '../dist/features/dns/providers/aliyun.js';
import { DnspodDnsProvider } from '../dist/features/dns/providers/dnspod.js';

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

function aliyunEncode(value) {
  return encodeURIComponent(value).replace(/\*/g, '%2A').replace(/\+/g, '%20').replace(/%7E/g, '~');
}

test('Aliyun signs and sends wildcard records using POP encoding', async () => {
  let requestUrl;
  globalThis.fetch = async input => {
    requestUrl = String(input);
    return jsonResponse({ RequestId: 'request', RecordId: 'record' });
  };

  const provider = new AliyunDnsProvider({
    accessKeyId: 'access-id',
    accessKeySecret: 'access-secret',
    domain: 'example.com',
  });
  const record = await provider.createRecord({
    subdomain: '*.autoxpose-test',
    ip: '192.0.2.1',
    type: 'A',
  });

  const url = new URL(requestUrl);
  const query = [...url.searchParams.entries()]
    .filter(([key]) => key !== 'Signature')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${aliyunEncode(key)}=${aliyunEncode(value)}`)
    .join('&');
  const stringToSign = `GET&${aliyunEncode('/')}&${aliyunEncode(query)}`;
  const expectedSignature = crypto
    .createHmac('sha1', 'access-secret&')
    .update(stringToSign)
    .digest('base64');

  assert.equal(url.searchParams.get('RR'), '*.autoxpose-test');
  assert.equal(url.searchParams.get('Signature'), expectedSignature);
  assert.equal(record.hostname, '*.autoxpose-test.example.com');
});

test('Aliyun maps structured errors from non-success responses', async () => {
  globalThis.fetch = async () =>
    jsonResponse(
      {
        RequestId: 'request',
        Code: 'InvalidAccessKeyId.NotFound',
        Message: 'Specified access key is not found.',
      },
      404
    );

  const provider = new AliyunDnsProvider({
    accessKeyId: 'invalid',
    accessKeySecret: 'invalid',
    domain: 'example.com',
  });

  await assert.rejects(provider.listRecords(), /Invalid API credentials/);
});

test('Aliyun paginates records and does not adopt disabled records', async () => {
  let page = 0;
  const requestedPages = [];
  globalThis.fetch = async input => {
    page += 1;
    requestedPages.push(Number(new URL(String(input)).searchParams.get('PageNumber')));
    const count = page === 1 ? 500 : 1;
    const records = Array.from({ length: count }, (_, index) => ({
      RecordId: `${page}-${index}`,
      RR: page === 2 ? 'disabled' : `app-${index}`,
      Type: 'A',
      Value: '192.0.2.1',
      TTL: 600,
      Status: page === 2 ? 'Disable' : 'Enable',
    }));
    return jsonResponse({
      RequestId: 'request',
      TotalCount: 501,
      DomainRecords: { Record: records },
    });
  };

  const provider = new AliyunDnsProvider({
    accessKeyId: 'access-id',
    accessKeySecret: 'access-secret',
    domain: 'example.com',
  });

  const records = await provider.listRecords();
  assert.equal(records.length, 501);
  assert.equal(page, 2);
  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(records.at(-1).active, false);

  page = 0;
  assert.equal(await provider.findByHostname('disabled'), null);
});

function expectedDnspodAuthorization({ action, body, timestamp, secretId, secretKey }) {
  const date = new Date(timestamp * 1000).toISOString().split('T')[0];
  const credentialScope = `${date}/dnspod/tc3_request`;
  const hashedPayload = crypto.createHash('sha256').update(body).digest('hex');
  const canonicalRequest = [
    'POST',
    '/',
    '',
    'content-type:application/json; charset=utf-8',
    'host:dnspod.tencentcloudapi.com',
    `x-tc-action:${action.toLowerCase()}`,
    '',
    'content-type;host;x-tc-action',
    hashedPayload,
  ].join('\n');
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');
  const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
  const secretService = crypto.createHmac('sha256', secretDate).update('dnspod').digest();
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`;
}

test('DNSPod signs the exact payload sent to the China endpoint', async () => {
  let captured;
  globalThis.fetch = async (input, init) => {
    captured = { input: String(input), init };
    return jsonResponse({ Response: { RequestId: 'request', RecordId: 123 } });
  };

  const provider = new DnspodDnsProvider({
    secretId: 'secret-id',
    secretKey: 'secret-key',
    domain: 'example.com',
  });
  await provider.createRecord({ subdomain: '*.autoxpose-test', ip: '192.0.2.1', type: 'A' });

  const timestamp = Number(captured.init.headers['X-TC-Timestamp']);
  const expected = expectedDnspodAuthorization({
    action: 'CreateRecord',
    body: captured.init.body,
    timestamp,
    secretId: 'secret-id',
    secretKey: 'secret-key',
  });

  assert.equal(captured.input, 'https://dnspod.tencentcloudapi.com');
  assert.equal(captured.init.headers.Authorization, expected);
  assert.deepEqual(JSON.parse(captured.init.body), {
    Domain: 'example.com',
    SubDomain: '*.autoxpose-test',
    RecordType: 'A',
    Value: '192.0.2.1',
    RecordLine: '默认',
    TTL: 600,
  });
});

test('DNSPod paginates records and does not adopt disabled records', async () => {
  let offset = 0;
  const requestedOffsets = [];
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(init.body);
    offset = payload.Offset;
    requestedOffsets.push(offset);
    const count = offset === 0 ? 3000 : 1;
    const records = Array.from({ length: count }, (_, index) => ({
      RecordId: offset + index,
      Name: offset === 3000 ? 'disabled' : `app-${index}`,
      Type: 'A',
      Value: '192.0.2.1',
      TTL: 600,
      Status: offset === 3000 ? 'DISABLE' : 'ENABLE',
    }));
    return jsonResponse({
      Response: {
        RequestId: 'request',
        RecordCountInfo: { TotalCount: 3001 },
        RecordList: records,
      },
    });
  };

  const provider = new DnspodDnsProvider({
    secretId: 'secret-id',
    secretKey: 'secret-key',
    domain: 'example.com',
  });

  const records = await provider.listRecords();
  assert.equal(records.length, 3001);
  assert.equal(offset, 3000);
  assert.deepEqual(requestedOffsets, [0, 3000]);
  assert.equal(records.at(-1).active, false);

  offset = 0;
  assert.equal(await provider.findByHostname('disabled'), null);
});

test('DNSPod maps missing records before duplicate records', async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      Response: {
        RequestId: 'request',
        Error: {
          Code: 'ResourceNotFound.NoDataOfRecord',
          Message: 'record does not exist',
        },
      },
    });
  const provider = new DnspodDnsProvider({
    secretId: 'secret-id',
    secretKey: 'secret-key',
    domain: 'example.com',
  });

  await assert.rejects(provider.deleteRecord('123'), /DNS record not found/);
});

test('provider pagination rejects incomplete pages', async () => {
  globalThis.fetch = async input => {
    if (String(input).includes('alidns')) {
      return jsonResponse({
        RequestId: 'request',
        TotalCount: 2,
        DomainRecords: { Record: [] },
      });
    }
    return jsonResponse({
      Response: {
        RequestId: 'request',
        RecordCountInfo: { TotalCount: 2 },
        RecordList: [],
      },
    });
  };
  const aliyun = new AliyunDnsProvider({
    accessKeyId: 'access-id',
    accessKeySecret: 'access-secret',
    domain: 'example.com',
  });
  const dnspod = new DnspodDnsProvider({
    secretId: 'secret-id',
    secretKey: 'secret-key',
    domain: 'example.com',
  });

  await assert.rejects(aliyun.listRecords(), /ended before all records/);
  await assert.rejects(dnspod.listRecords(), /ended before all records/);
});
