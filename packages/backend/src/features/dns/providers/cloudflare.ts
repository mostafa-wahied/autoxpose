import { ProviderError } from '../../../core/errors/index.js';
import type { CreateRecordInput, DnsProvider, DnsProviderConfig, DnsRecord } from '../dns.types.js';

const API_BASE = 'https://api.cloudflare.com/client/v4';

export class CloudflareDnsProvider implements DnsProvider {
  readonly name = 'cloudflare';
  private token: string;
  private zoneId: string;

  constructor(config: DnsProviderConfig) {
    this.token = config.token;
    this.zoneId = config.zoneId || '';
  }

  async createRecord(input: CreateRecordInput): Promise<DnsRecord> {
    const response = await this.request<{ result: Record<string, unknown> }>(
      `/zones/${this.zoneId}/dns_records`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: input.type || 'A',
          name: input.subdomain,
          content: input.ip,
          ttl: input.ttl || 3600,
        }),
      }
    );

    return this.mapRecord(response.result);
  }

  async deleteRecord(recordId: string): Promise<void> {
    await this.request(`/zones/${this.zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
    });
  }

  async listRecords(): Promise<DnsRecord[]> {
    const response = await this.request<{ result: Record<string, unknown>[] }>(
      `/zones/${this.zoneId}/dns_records`
    );
    return response.result.map(r => this.mapRecord(r));
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

    const data = await response.json();

    if (!response.ok || !(data as { success?: boolean }).success) {
      throw new ProviderError('cloudflare', `API error: ${response.status}`);
    }

    return data as T;
  }

  private mapRecord(raw: Record<string, unknown>): DnsRecord {
    return {
      id: String(raw.id),
      hostname: String(raw.name),
      type: String(raw.type),
      value: String(raw.content),
      ttl: Number(raw.ttl),
    };
  }
}
