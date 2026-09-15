import crypto from 'crypto';
import { ProviderError } from '../../../core/errors/index.js';
import type { CreateRecordInput, DnsProvider, DnsProviderConfig, DnsRecord } from '../dns.types.js';

const API_HOST = 'dnspod.tencentcloudapi.com';
const SERVICE = 'dnspod';
const API_VERSION = '2021-03-23';

function includesAny(value: string, terms: string[]): boolean {
  return terms.some(term => value.includes(term));
}

export type DnspodConfig = Omit<DnsProviderConfig, 'token'> & {
  secretId: string;
  secretKey: string;
};

type DnspodRecord = {
  RecordId: number;
  Name: string;
  Type: string;
  Value: string;
  TTL: number;
  Status: string;
};

type DnspodResponse<T> = {
  Response: T & { Error?: { Code: string; Message: string }; RequestId: string };
};

export class DnspodDnsProvider implements DnsProvider {
  readonly name = 'dnspod';
  private secretId: string;
  private secretKey: string;
  private domain: string;

  constructor(config: DnspodConfig) {
    this.secretId = config.secretId;
    this.secretKey = config.secretKey;
    this.domain = config.domain || '';
  }

  async createRecord(input: CreateRecordInput): Promise<DnsRecord> {
    const subdomain = this.extractSubdomain(input.subdomain);
    const params = {
      Domain: this.domain,
      SubDomain: subdomain,
      RecordType: input.type || 'A',
      Value: input.ip,
      RecordLine: '默认',
      TTL: input.ttl || 600,
    };

    const response = await this.request<{ RecordId: number }>('CreateRecord', params);

    return {
      id: String(response.RecordId),
      hostname: this.buildFullHostname(subdomain),
      type: input.type || 'A',
      value: input.ip,
      ttl: input.ttl || 600,
    };
  }

  async deleteRecord(recordId: string): Promise<void> {
    await this.request('DeleteRecord', {
      Domain: this.domain,
      RecordId: Number(recordId),
    });
  }

  async listRecords(): Promise<DnsRecord[]> {
    const records: DnsRecord[] = [];
    let offset = 0;
    const limit = 3000;
    let totalCount: number | null = null;

    do {
      const response = await this.request<{
        RecordList: DnspodRecord[];
        RecordCountInfo: { TotalCount: number };
      }>('DescribeRecordList', {
        Domain: this.domain,
        Offset: offset,
        Limit: limit,
      });

      const recordList = response.RecordList;
      totalCount = Number(response.RecordCountInfo?.TotalCount);
      if (!Array.isArray(recordList) || !Number.isFinite(totalCount)) {
        throw new ProviderError('dnspod', 'DNS record list response was incomplete.');
      }
      records.push(...recordList.map(r => this.mapRecord(r)));

      offset += recordList.length;
      if (recordList.length === 0 && offset < totalCount) {
        throw new ProviderError(
          'dnspod',
          'DNS record list ended before all records were returned.'
        );
      }
    } while (offset < totalCount);

    return records;
  }

  async findByHostname(hostname: string): Promise<DnsRecord | null> {
    const records = await this.listRecords();
    return (
      records.find(
        r =>
          r.active !== false &&
          (r.type === 'A' || r.type === 'CNAME') &&
          (r.hostname === hostname || r.hostname === this.buildFullHostname(hostname))
      ) ?? null
    );
  }

  private extractSubdomain(subdomain: string): string {
    if (!this.domain) return subdomain;
    if (subdomain.endsWith(`.${this.domain}`)) {
      return subdomain.slice(0, -(this.domain.length + 1));
    }
    return subdomain;
  }

  private buildFullHostname(subdomain: string): string {
    if (!this.domain) return subdomain;
    if (subdomain === '@') return this.domain;
    return `${subdomain}.${this.domain}`;
  }

  private mapRecord(raw: DnspodRecord): DnsRecord {
    return {
      id: String(raw.RecordId),
      hostname: raw.Name === '@' ? this.domain : `${raw.Name}.${this.domain}`,
      type: raw.Type,
      value: raw.Value,
      ttl: Number(raw.TTL),
      active: raw.Status === 'ENABLE',
    };
  }

  private async request<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().split('T')[0];

    const authorization = this.signRequest(action, body, timestamp, date);

    const response = await fetch(`https://${API_HOST}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-TC-Action': action,
        'X-TC-Version': API_VERSION,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': '',
        Authorization: authorization,
      },
      body,
    });

    if (!response.ok) {
      throw new ProviderError('dnspod', `Connection failed (HTTP ${response.status})`);
    }

    const data = (await response.json()) as DnspodResponse<T>;

    if (data.Response?.Error) {
      const msg = this.getErrorMessage(data.Response.Error.Code, data.Response.Error.Message);
      throw new ProviderError('dnspod', msg);
    }

    return data.Response as T;
  }

  private signRequest(action: string, payload: string, timestamp: number, date: string): string {
    const credentialScope = `${date}/${SERVICE}/tc3_request`;

    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

    const canonicalRequest = [
      'POST',
      '/',
      '',
      `content-type:application/json; charset=utf-8`,
      `host:${API_HOST}`,
      `x-tc-action:${action.toLowerCase()}`,
      '',
      'content-type;host;x-tc-action',
      hashedPayload,
    ].join('\n');

    const hashedCanonicalRequest = crypto
      .createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');

    const stringToSign = [
      'TC3-HMAC-SHA256',
      String(timestamp),
      credentialScope,
      hashedCanonicalRequest,
    ].join('\n');

    const secretDate = crypto.createHmac('sha256', `TC3${this.secretKey}`).update(date).digest();
    const secretService = crypto.createHmac('sha256', secretDate).update(SERVICE).digest();
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    return `TC3-HMAC-SHA256 Credential=${this.secretId}/${credentialScope}, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`;
  }

  private getErrorMessage(code: string, message: string): string {
    const lower = (code + message).toLowerCase();
    if (includesAny(lower, ['authfailure', 'secretid', 'signature'])) {
      return 'Invalid API credentials. Check your SecretId and SecretKey.';
    }
    if (includesAny(lower, ['domainnotexist', 'no such domain'])) {
      return 'Domain not found. Confirm the domain is registered with Tencent Cloud DNSPod.';
    }
    if (/record.*not exist|not exist.*record/.test(lower)) {
      return 'DNS record not found.';
    }
    if (/record.*exist|exist.*record/.test(lower)) {
      return 'Record already exists. Delete it first.';
    }
    if (includesAny(lower, ['limitexceeded', 'quota'])) {
      return 'DNS record quota exceeded.';
    }
    const cleaned = message.trim();
    return cleaned.length > 0 ? cleaned : `DNSPod API error (${code})`;
  }
}
