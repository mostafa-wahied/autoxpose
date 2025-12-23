import { ProviderError } from '../../../core/errors/index.js';
import type { CreateRecordInput, DnsProvider, DnsProviderConfig, DnsRecord } from '../dns.types.js';

const API_BASE = 'https://api.netlify.com/api/v1';

export class NetlifyDnsProvider implements DnsProvider {
  readonly name = 'netlify';
  private token: string;
  private zoneId: string;
  private domain: string;

  constructor(config: DnsProviderConfig) {
    this.token = config.token;
    this.zoneId = config.zoneId || '';
    this.domain = config.domain || '';
  }

  async createRecord(input: CreateRecordInput): Promise<DnsRecord> {
    const hostname = this.buildHostname(input.subdomain);
    const response = await this.request<Record<string, unknown>>(
      `/dns_zones/${this.zoneId}/dns_records`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: input.type || 'A',
          hostname,
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
    const target = this.buildHostname(hostname);
    const records = await this.listRecords();
    return (
      records.find(
        r =>
          (r.type === 'A' || r.type === 'CNAME') &&
          (this.matchesHostname(r.hostname, target) || this.matchesHostname(r.hostname, hostname))
      ) ?? null
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
      const body = await response.text();
      const detail = body ? `: ${body}` : '';
      const msg = this.getErrorMessage(response.status, path) + detail;
      throw new ProviderError('netlify', msg);
    }

    if (response.status === 204) return null as T;
    return response.json() as Promise<T>;
  }

  private getErrorMessage(status: number, path: string): string {
    const isZoneOp = path.includes('/dns_zones/');
    if (status === 404 && isZoneOp) {
      return `DNS Zone not found. Verify your Zone ID in Netlify settings.`;
    }
    if (status === 401) return 'Invalid API token. Check your credentials.';
    if (status === 403) return 'Insufficient permissions. Token needs DNS management access.';
    if (status === 404) return 'Resource not found. Check your configuration.';
    return `Connection failed (HTTP ${status}).`;
  }

  private buildHostname(subdomain: string): string {
    if (!this.domain) return subdomain;
    if (subdomain.endsWith(this.domain)) return subdomain;
    return `${subdomain}.${this.domain}`;
  }

  private matchesHostname(actual: string, expected: string): boolean {
    const cleanActual = actual.toLowerCase().replace(/\.$/, '');
    const cleanExpected = expected.toLowerCase().replace(/\.$/, '');
    return cleanActual === cleanExpected;
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
