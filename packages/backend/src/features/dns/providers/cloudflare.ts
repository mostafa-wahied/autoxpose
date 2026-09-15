import { ProviderError } from '../../../core/errors/index.js';
import type { CreateRecordInput, DnsProvider, DnsProviderConfig, DnsRecord } from '../dns.types.js';

const API_BASE = 'https://api.cloudflare.com/client/v4';

export class CloudflareDnsProvider implements DnsProvider {
  readonly name = 'cloudflare';
  private token: string;
  private zoneId: string;
  private domain: string;

  constructor(config: DnsProviderConfig) {
    this.token = config.token;
    this.zoneId = config.zoneId || '';
    this.domain = config.domain || '';
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
    const path = `/zones/${this.zoneId}/dns_records/${recordId}`;
    const result = await this.requestWithMeta(path, { method: 'DELETE' });
    if (result.ok) return;
    if (this.shouldUseBatchDelete(result.status, result.data)) {
      await this.request(`/zones/${this.zoneId}/dns/records/batch`, {
        method: 'POST',
        body: JSON.stringify({ deletes: [{ id: recordId }] }),
      });
      return;
    }
    const msg = this.getErrorMessage(result.status, path, result.data);
    throw new ProviderError('cloudflare', msg);
  }

  async listRecords(): Promise<DnsRecord[]> {
    const records: DnsRecord[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const response = await this.request<{
        result: Record<string, unknown>[];
        result_info?: { total_pages?: number; total_count?: number };
      }>(`/zones/${this.zoneId}/dns_records?page=${page}&per_page=100`);
      if (!Array.isArray(response.result))
        throw new ProviderError('cloudflare', 'Invalid record list');
      records.push(...response.result.map(record => this.mapRecord(record)));
      if (page >= (response.result_info?.total_pages ?? 1)) {
        if (
          response.result_info?.total_count !== undefined &&
          records.length < response.result_info.total_count
        ) {
          throw new ProviderError('cloudflare', 'DNS record list is incomplete');
        }
        return records;
      }
      if (!response.result.length)
        throw new ProviderError('cloudflare', 'DNS page is empty before inventory completion');
    }
    throw new ProviderError('cloudflare', 'DNS record list is incomplete');
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
    const result = await this.requestWithMeta<T>(path, options);
    if (!result.ok) {
      const msg = this.getErrorMessage(result.status, path, result.data);
      throw new ProviderError('cloudflare', msg);
    }

    return result.data as T;
  }

  private async requestWithMeta<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<{ ok: boolean; status: number; data: CloudflareResponse<T> }> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = (await response.json()) as CloudflareResponse<T>;
    const ok = response.ok && data.success === true;
    return { ok, status: response.status, data };
  }

  private getErrorMessage(
    status: number,
    path: string,
    data?: CloudflareResponse<unknown>
  ): string {
    const isZoneOp = path.includes('/zones/');
    const apiMessage = this.getApiMessage(data);
    if (status === 404 && isZoneOp) {
      return 'DNS Zone not found. Verify your Zone ID in Cloudflare.';
    }
    if (status === 404) return 'Resource not found. Check your configuration.';
    if (status === 401) return 'Invalid API token. Check your credentials.';
    if (status === 403) return 'Insufficient permissions. Token needs Zone:DNS:Edit access.';
    if (apiMessage) return apiMessage;
    return `Connection failed (HTTP ${status}).`;
  }

  private getApiMessage(data?: CloudflareResponse<unknown>): string | null {
    const message = data?.errors?.[0]?.message;
    return typeof message === 'string' && message.length > 0 ? message : null;
  }

  private shouldUseBatchDelete(status: number, data: CloudflareResponse<unknown>): boolean {
    return (
      status === 405 &&
      this.getApiMessage(data) ===
        'DELETE method not allowed for the api_token authentication scheme'
    );
  }

  private buildHostname(hostname: string): string {
    if (!this.domain || hostname.includes('.')) return hostname;
    return `${hostname}.${this.domain}`;
  }

  private matchesHostname(actual: string, expected: string): boolean {
    const cleanActual = actual.toLowerCase().replace(/\.$/, '');
    const cleanExpected = expected.toLowerCase().replace(/\.$/, '');
    return cleanActual === cleanExpected;
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

type CloudflareResponse<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
};
