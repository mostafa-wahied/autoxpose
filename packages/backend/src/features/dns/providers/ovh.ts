import OvhApi from '@ovhcloud/node-ovh';
import { ProviderError } from '../../../core/errors/index.js';
import type { CreateRecordInput, DnsProvider, DnsProviderConfig, DnsRecord } from '../dns.types.js';

type OvhConfig = DnsProviderConfig & {
  appKey: string;
  appSecret: string;
  consumerKey: string;
  endpoint?: string;
};

export class OvhDnsProvider implements DnsProvider {
  readonly name = 'ovh';
  private client: ReturnType<typeof OvhApi>;
  private domain: string;

  constructor(config: OvhConfig) {
    this.domain = config.domain || '';
    this.client = OvhApi({
      endpoint: config.endpoint || 'ovh-eu',
      appKey: config.appKey || '',
      appSecret: config.appSecret || '',
      consumerKey: config.consumerKey || config.token || '',
    });
  }

  async createRecord(input: CreateRecordInput): Promise<DnsRecord> {
    const subDomain = this.toSubDomain(input.subdomain);
    const target =
      (input.type || 'A') === 'CNAME' && !input.ip.endsWith('.') ? `${input.ip}.` : input.ip;
    const body = {
      fieldType: input.type || 'A',
      subDomain,
      target,
      ttl: input.ttl || 3600,
    };
    try {
      const raw = await this.request<OvhRecord>(
        'POST',
        `/domain/zone/${this.domain}/record`,
        body
      );
      await this.refresh();
      return this.mapRecord(raw);
    } catch (err) {
      if (this.isConflictError(err)) {
        const existing = await this.deleteConflicting(subDomain, body.fieldType, body.target);
        if (existing) return existing;
        const raw = await this.request<OvhRecord>(
          'POST',
          `/domain/zone/${this.domain}/record`,
          body
        );
        await this.refresh();
        return this.mapRecord(raw);
      }
      throw err;
    }
  }

  async deleteRecord(recordId: string): Promise<void> {
    await this.request('DELETE', `/domain/zone/${this.domain}/record/${recordId}`);
    await this.refresh();
  }

  async listRecords(): Promise<DnsRecord[]> {
    const ids = await this.request<number[]>('GET', `/domain/zone/${this.domain}/record`);
    const records = await this.fetchRecords(ids);
    return records.map(r => this.mapRecord(r));
  }

  async findByHostname(hostname: string): Promise<DnsRecord | null> {
    // Callers pass the bare subdomain (e.g. "app"); expand it to the full
    // hostname so it matches the mapped record hostname ("app.example.com").
    const target = this.normalizeHostname(this.buildHostname(hostname));
    // OVH supports server-side filtering by subDomain, so we only fetch the
    // handful of records that can possibly match instead of the whole zone.
    const subDomain = this.toSubDomain(target);
    const ids = await this.request<number[]>('GET', `/domain/zone/${this.domain}/record`, {
      subDomain,
    });
    const records = await this.fetchRecords(ids);
    return (
      records
        .map(r => this.mapRecord(r))
        .find(
          r =>
            (r.type === 'A' || r.type === 'CNAME') && this.normalizeHostname(r.hostname) === target
        ) ?? null
    );
  }

  private async fetchRecords(ids: number[]): Promise<OvhRecord[]> {
    const records = await Promise.all(
      ids.map(id =>
        this.request<OvhRecord>('GET', `/domain/zone/${this.domain}/record/${id}`).catch(() => null)
      )
    );
    return records.filter((r): r is OvhRecord => r !== null);
  }

  async testConnection(): Promise<void> {
    await this.request('GET', `/domain/zone/${this.domain}`);
  }

  private isConflictError(err: unknown): boolean {
    if (err instanceof Error) {
      const lower = err.message.toLowerCase();
      return lower.includes('cname and other data') || lower.includes('conflict');
    }
    return false;
  }

  private async deleteConflicting(
    subDomain: string,
    newType: string,
    newTarget: string
  ): Promise<DnsRecord | null> {
    try {
      const ids = await this.request<number[]>('GET', `/domain/zone/${this.domain}/record`, {
        subDomain,
      });
      const records = await this.fetchRecords(ids);
      let deleted = false;
      for (const rec of records) {
        if (rec.fieldType === newType && this.sameTarget(rec.target, newTarget)) {
          return this.mapRecord(rec);
        }
        const conflicting =
          (newType === 'CNAME' && rec.fieldType !== 'CNAME') ||
          (newType !== 'CNAME' && rec.fieldType === 'CNAME');
        if (conflicting) {
          await this.request('DELETE', `/domain/zone/${this.domain}/record/${rec.id}`);
          deleted = true;
        }
      }
      if (deleted) await this.refresh();
    } catch {
      // best-effort cleanup
    }
    return null;
  }

  private sameTarget(a: string, b: string): boolean {
    return a.replace(/\.$/, '').toLowerCase() === b.replace(/\.$/, '').toLowerCase();
  }

  private async refresh(): Promise<void> {
    try {
      await this.request('POST', `/domain/zone/${this.domain}/refresh`);
    } catch {
      // refresh failures should not break the create/delete operation
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return (await this.client.requestPromised(method, path, body)) as T;
    } catch (err) {
      // node-ovh rejects with { error, message }. For HTTP failures `error` is
      // the numeric status and `message` is the API message; for network /
      // time-sync / parse failures `error` is itself a descriptive string.
      const { error, message } = (err ?? {}) as { error?: number | string; message?: string };
      const status = typeof error === 'number' ? error : 0;
      const apiMessage = message ?? (typeof error === 'string' ? error : undefined);
      throw new ProviderError('ovh', this.getErrorMessage(status, path, apiMessage));
    }
  }

  private getErrorMessage(status: number, path: string, apiMessage?: string): string {
    const isZoneOp = path.includes('/domain/zone/');
    if (status === 404 && isZoneOp) {
      return 'DNS zone not found. Ensure the domain is hosted at OVH.';
    }
    if (status === 404) return 'Resource not found. Check your configuration.';
    if (status === 403) {
      const lower = (apiMessage || '').toLowerCase();
      if (lower.includes('not been granted') || lower.includes('not granted')) {
        return 'This API call has not been granted. Ensure your token has GET, POST and DELETE rights on /domain/zone/{domain}/*.';
      }
      return apiMessage || 'Insufficient permissions. Check your token access rules.';
    }
    if (status === 401) {
      return apiMessage || 'Invalid OVH credentials. Verify Application Key, Secret and Consumer Key.';
    }
    if (apiMessage) return apiMessage;
    if (status > 0) return `Connection failed (HTTP ${status}).`;
    return 'Connection failed.';
  }

  private toSubDomain(subdomain: string): string {
    if (!subdomain) return '';
    if (subdomain === this.domain) return '';
    if (this.domain && subdomain.endsWith(`.${this.domain}`)) {
      return subdomain.slice(0, -(this.domain.length + 1));
    }
    return subdomain;
  }

  private buildHostname(hostname: string): string {
    if (!this.domain) return hostname;
    // A bare subdomain may itself contain dots (e.g. "planning.chv"), so we
    // can't use "includes('.')" to decide if it is already fully-qualified —
    // only skip appending when it already ends with the configured domain.
    const normalized = this.normalizeHostname(hostname);
    if (normalized === this.domain || normalized.endsWith(`.${this.domain}`)) return hostname;
    return `${hostname}.${this.domain}`;
  }

  private normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/\.$/, '');
  }

  private mapRecord(raw: OvhRecord): DnsRecord {
    const zone = String(raw.zone || this.domain);
    const sub = String(raw.subDomain || '');
    const hostname = sub ? `${sub}.${zone}` : zone;
    return {
      id: String(raw.id),
      hostname,
      type: String(raw.fieldType),
      value: String(raw.target),
      ttl: Number(raw.ttl),
    };
  }
}

type OvhRecord = {
  id: number | string;
  zone?: string;
  subDomain?: string;
  fieldType: string;
  target: string;
  ttl: number;
};
