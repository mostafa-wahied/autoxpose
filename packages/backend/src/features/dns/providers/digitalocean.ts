import { ProviderError } from '../../../core/errors/index.js';
import type { CreateRecordInput, DnsProvider, DnsProviderConfig, DnsRecord } from '../dns.types.js';

const API_BASE = 'https://api.digitalocean.com/v2';

export class DigitalOceanDnsProvider implements DnsProvider {
  readonly name = 'digitalocean';
  private token: string;
  private domain: string;

  constructor(config: DnsProviderConfig) {
    this.token = config.token;
    this.domain = config.domain || '';
  }

  async createRecord(input: CreateRecordInput): Promise<DnsRecord> {
    const response = await this.request<{ domain_record: Record<string, unknown> }>(
      `/domains/${this.domain}/records`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: input.type || 'A',
          name: input.subdomain,
          data: input.ip,
          ttl: input.ttl || 3600,
        }),
      }
    );

    return this.mapRecord(response.domain_record);
  }

  async deleteRecord(recordId: string): Promise<void> {
    await this.request(`/domains/${this.domain}/records/${recordId}`, {
      method: 'DELETE',
    });
  }

  async listRecords(): Promise<DnsRecord[]> {
    const response = await this.request<{ domain_records: Record<string, unknown>[] }>(
      `/domains/${this.domain}/records`
    );
    return response.domain_records.map(r => this.mapRecord(r));
  }

  async findByHostname(hostname: string): Promise<DnsRecord | null> {
    const records = await this.listRecords();
    return (
      records.find(r => r.hostname === hostname && (r.type === 'A' || r.type === 'CNAME')) ?? null
    );
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
      const msg = this.getErrorMessage(response.status, path);
      throw new ProviderError('digitalocean', msg);
    }

    if (response.status === 204) return null as T;
    return response.json() as Promise<T>;
  }

  private getErrorMessage(status: number, path: string): string {
    const isDomainOp = path.includes('/domains/');
    if (status === 404 && isDomainOp) {
      return 'Domain not found. Add it to DigitalOcean Networking > Domains first.';
    }
    if (status === 404) return 'Resource not found. Check your configuration.';
    if (status === 401) return 'Invalid API token. Check your credentials.';
    if (status === 403)
      return 'Insufficient permissions. Token needs read/write access for Domains.';
    return `Connection failed (HTTP ${status}).`;
  }

  private mapRecord(raw: Record<string, unknown>): DnsRecord {
    return {
      id: String(raw.id),
      hostname: String(raw.name),
      type: String(raw.type),
      value: String(raw.data),
      ttl: Number(raw.ttl),
    };
  }
}
