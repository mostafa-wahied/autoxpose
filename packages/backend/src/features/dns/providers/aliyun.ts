import crypto from 'crypto';
import { ProviderError } from '../../../core/errors/index.js';
import type { CreateRecordInput, DnsProvider, DnsProviderConfig, DnsRecord } from '../dns.types.js';

const API_BASE = 'https://alidns.aliyuncs.com';

function popEncode(str: string): string {
  return encodeURIComponent(str).replace(/\*/g, '%2A').replace(/\+/g, '%20').replace(/%7E/g, '~');
}

export type AliyunConfig = Omit<DnsProviderConfig, 'token'> & {
  accessKeyId: string;
  accessKeySecret: string;
};

export class AliyunDnsProvider implements DnsProvider {
  readonly name = 'aliyun';
  private accessKeyId: string;
  private accessKeySecret: string;
  private domain: string;

  constructor(config: AliyunConfig) {
    this.accessKeyId = config.accessKeyId;
    this.accessKeySecret = config.accessKeySecret;
    this.domain = config.domain || '';
  }

  async createRecord(input: CreateRecordInput): Promise<DnsRecord> {
    const fullHostname = this.buildFullHostname(input.subdomain);
    const params: Record<string, string> = {
      Action: 'AddDomainRecord',
      DomainName: this.domain,
      RR: input.subdomain,
      Type: input.type || 'A',
      Value: input.ip,
      TTL: String(input.ttl || 600),
    };

    const response = await this.request<AliyunApiResponse<{ RecordId: string }>>(params);

    return {
      id: response.RecordId,
      hostname: fullHostname,
      type: input.type || 'A',
      value: input.ip,
      ttl: input.ttl || 600,
    };
  }

  async deleteRecord(recordId: string): Promise<void> {
    const params: Record<string, string> = {
      Action: 'DeleteDomainRecord',
      RecordId: recordId,
    };

    await this.request(params);
  }

  async listRecords(): Promise<DnsRecord[]> {
    const records: DnsRecord[] = [];
    let pageNumber = 1;
    const pageSize = 500;
    let totalCount: number | null = null;

    do {
      const params: Record<string, string> = {
        Action: 'DescribeDomainRecords',
        DomainName: this.domain,
        PageNumber: String(pageNumber),
        PageSize: String(pageSize),
      };

      const response = await this.request<{
        DomainRecords: { Record: AliyunRecord[] };
        TotalCount: number;
      }>(params);

      const recordList = response.DomainRecords?.Record;
      totalCount = Number(response.TotalCount);
      if (!Array.isArray(recordList) || !Number.isFinite(totalCount)) {
        throw new ProviderError('aliyun', 'DNS record list response was incomplete.');
      }
      records.push(...recordList.map(r => this.mapRecord(r)));

      if (recordList.length === 0 && records.length < totalCount) {
        throw new ProviderError(
          'aliyun',
          'DNS record list ended before all records were returned.'
        );
      }
      pageNumber++;
    } while (records.length < totalCount);

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

  private buildFullHostname(subdomain: string): string {
    if (!this.domain) return subdomain;
    if (subdomain.endsWith(`.${this.domain}`)) return subdomain;
    if (subdomain === this.domain) return subdomain;
    if (subdomain === '@') return this.domain;
    return `${subdomain}.${this.domain}`;
  }

  private async request<T>(params: Record<string, string>): Promise<T> {
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const nonce = crypto.randomUUID();

    const commonParams: Record<string, string> = {
      Format: 'JSON',
      Version: '2015-01-09',
      AccessKeyId: this.accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      Timestamp: timestamp,
      SignatureVersion: '1.0',
      SignatureNonce: nonce,
      Lang: 'en',
    };

    const sortedParams = Object.keys(params)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = params[key];
          return acc;
        },
        {} as Record<string, string>
      );

    const allParams = { ...commonParams, ...sortedParams };

    const sortedAllParams = Object.keys(allParams)
      .sort()
      .map(key => `${popEncode(key)}=${popEncode(allParams[key])}`)
      .join('&');

    const stringToSign = `GET&${popEncode('/')}&${popEncode(sortedAllParams)}`;
    const signature = crypto
      .createHmac('sha1', `${this.accessKeySecret}&`)
      .update(stringToSign)
      .digest('base64');

    const url = `${API_BASE}/?${sortedAllParams}&Signature=${encodeURIComponent(signature)}`;

    const response = await fetch(url);
    const data = (await response.json().catch(() => null)) as
      | (AliyunApiResponse<T> & { Code?: string; Message?: string })
      | null;

    if (data?.Code) {
      const msg = this.getErrorMessage(data.Code || '', data.Message || '');
      throw new ProviderError('aliyun', msg);
    }
    if (!response.ok) {
      throw new ProviderError('aliyun', `Connection failed (HTTP ${response.status})`);
    }
    if (!data) {
      throw new ProviderError('aliyun', 'Invalid response from Aliyun DNS.');
    }

    return data as T;
  }

  private getErrorMessage(code: string, message: string): string {
    const lower = (code + message).toLowerCase();
    if (lower.includes('invalidaccesskey') || lower.includes('invalid signature')) {
      return 'Invalid API credentials. Check your AccessKey ID and Secret.';
    }
    if (lower.includes('domain') && lower.includes('not exist')) {
      return 'Domain not found. Confirm the domain is registered with Aliyun DNS.';
    }
    if (lower.includes('record') && lower.includes('exist')) {
      return 'Record already exists. Delete it first.';
    }
    if (lower.includes('quota')) {
      return 'DNS record quota exceeded.';
    }
    const cleaned = message.trim();
    return cleaned.length > 0 ? cleaned : `Aliyun API error (${code})`;
  }

  private mapRecord(raw: AliyunRecord): DnsRecord {
    return {
      id: raw.RecordId,
      hostname: raw.RR === '@' ? this.domain : `${raw.RR}.${this.domain}`,
      type: raw.Type,
      value: raw.Value,
      ttl: Number(raw.TTL),
      active: raw.Status === 'Enable',
    };
  }
}

type AliyunRecord = {
  RecordId: string;
  RR: string;
  Type: string;
  Value: string;
  TTL: number;
  Status: string;
};

type AliyunApiResponse<T> = {
  RequestId: string;
} & T;
