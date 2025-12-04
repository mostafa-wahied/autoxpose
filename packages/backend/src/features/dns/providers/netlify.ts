import { ProviderError } from '../../../core/errors/index.js';
import type { CreateRecordInput, DnsProvider, DnsProviderConfig, DnsRecord } from '../dns.types.js';

const API_BASE = 'https://api.netlify.com/api/v1';

export class NetlifyDnsProvider implements DnsProvider {
  readonly name = 'netlify';
  private token: string;
  private zoneId: string;

  constructor(config: DnsProviderConfig) {
    this.token = config.token;
    this.zoneId = config.zoneId || '';
  }

  async createRecord(input: CreateRecordInput): Promise<DnsRecord> {
    const response = await this.request<Record<string, unknown>>(
      `/dns_zones/${this.zoneId}/dns_records`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: input.type || 'A',
          hostname: input.subdomain,
          value: input.ip,
          ttl: input.ttl || 3600,
        }),
      }
    );

    return this.mapRecord(response);
  }

  async deleteRecord(recordId: string): Promise<void> {
    await this.request(`/dns_zones/${this.zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
    });
  }

  async listRecords(): Promise<DnsRecord[]> {
    const records = await this.request<Record<string, unknown>[]>(
      `/dns_zones/${this.zoneId}/dns_records`
    );
    return records.map(r => this.mapRecord(r));
  }

  async findByHostname(hostname: string): Promise<DnsRecord | null> {
    const records = await this.listRecords();
    return records.find(r => r.hostname === hostname && r.type === 'A') ?? null;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new ProviderError('netlify', `API error: ${response.status} - ${errorBody}`);
    }

    if (response.status === 204) return null as T;
    return response.json() as Promise<T>;
  }

  private mapRecord(raw: Record<string, unknown>): DnsRecord {
    return {
      id: String(raw.id),
      hostname: String(raw.hostname),
      type: String(raw.type),
      value: String(raw.value),
      ttl: Number(raw.ttl),
    };
  }
}
