import { ProviderError } from '../../../core/errors/index.js';
import type { CreateRecordInput, DnsProvider, DnsProviderConfig, DnsRecord } from '../dns.types.js';

const API_BASE = 'https://api.porkbun.com/api/json/v3';

type PorkbunConfig = DnsProviderConfig & {
  apiKey: string;
  secretKey: string;
};

export class PorkbunDnsProvider implements DnsProvider {
  readonly name = 'porkbun';
  private apiKey: string;
  private secretKey: string;
  private domain: string;

  constructor(config: PorkbunConfig) {
    this.apiKey = config.apiKey || config.token;
    this.secretKey = config.secretKey || '';
    this.domain = config.domain || '';
  }

  async createRecord(input: CreateRecordInput): Promise<DnsRecord> {
    const response = await this.request<{ id: string }>(`/dns/create/${this.domain}`, {
      type: input.type || 'A',
      name: input.subdomain,
      content: input.ip,
      ttl: String(input.ttl || 600),
    });

    return {
      id: response.id,
      hostname: `${input.subdomain}.${this.domain}`,
      type: input.type || 'A',
      value: input.ip,
      ttl: input.ttl || 600,
    };
  }

  async deleteRecord(recordId: string): Promise<void> {
    await this.request(`/dns/delete/${this.domain}/${recordId}`, {});
  }

  async listRecords(): Promise<DnsRecord[]> {
    const response = await this.request<{ records: PorkbunRecord[] }>(
      `/dns/retrieve/${this.domain}`,
      {}
    );
    return (response.records || []).map(r => this.mapRecord(r));
  }

  async findByHostname(hostname: string): Promise<DnsRecord | null> {
    const records = await this.listRecords();
    return (
      records.find(r => r.hostname === hostname && (r.type === 'A' || r.type === 'CNAME')) ?? null
    );
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const payload = {
      apikey: this.apiKey,
      secretapikey: this.secretKey,
      ...body,
    };

    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { status: string; message?: string } & T;

    if (data.status !== 'SUCCESS') {
      const msg = this.getErrorMessage(data.message || '');
      throw new ProviderError('porkbun', msg);
    }

    return data as T;
  }

  private getErrorMessage(apiMessage: string): string {
    const lower = apiMessage.toLowerCase();
    if (lower.includes('invalid domain') || lower.includes('not found')) {
      return 'Domain not found. Ensure it is registered with Porkbun.';
    }
    if (lower.includes('invalid') && lower.includes('key')) {
      return 'Invalid API credentials. Check your API key and secret.';
    }
    if (lower.includes('authentication')) {
      return 'Authentication failed. Check your credentials.';
    }
    const cleaned = apiMessage.trim();
    return cleaned.length > 100
      ? cleaned.substring(0, 97) + '...'
      : cleaned || 'Connection test failed';
  }

  private mapRecord(raw: PorkbunRecord): DnsRecord {
    const hostname = raw.name === this.domain ? this.domain : raw.name;
    return {
      id: raw.id,
      hostname,
      type: raw.type,
      value: raw.content,
      ttl: parseInt(raw.ttl, 10),
    };
  }
}

type PorkbunRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: string;
};
