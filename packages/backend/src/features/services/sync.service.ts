import type { DnsRecord } from '../dns/dns.types.js';
import type { ProxyHost } from '../proxy/proxy.types.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { ServiceRecord, ServicesRepository } from './services.repository.js';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('sync-service');

export type SyncStatus = {
  id: string;
  name: string;
  subdomain: string;
  dbState: { enabled: boolean; dnsRecordId: string | null; proxyHostId: string | null };
  providerState: {
    hasDns: boolean;
    hasProxy: boolean;
    dnsId: string | null;
    proxyId: string | null;
  };
  isSynced: boolean;
};

type ProviderData = {
  dnsRecords: DnsRecord[];
  proxyHosts: ProxyHost[];
  baseDomain: string;
};

export class SyncService {
  constructor(
    private servicesRepo: ServicesRepository,
    private settings: SettingsService
  ) {}

  async getStatuses(services: ServiceRecord[]): Promise<SyncStatus[]> {
    const data = await this.fetchProviderData();
    return services.map(svc => this.buildStatus(svc, data));
  }

  async syncService(service: ServiceRecord): Promise<ServiceRecord> {
    const dns = await this.settings.getDnsProvider();
    const proxy = await this.settings.getProxyProvider();
    const baseDomain = await this.getBaseDomain();
    const fullDomain = baseDomain ? `${service.subdomain}.${baseDomain}` : service.subdomain;

    const dnsRecord = dns ? await dns.findByHostname(service.subdomain) : null;
    const proxyHost = proxy ? await proxy.findByDomain(fullDomain) : null;
    const isExposed = Boolean(dnsRecord) || Boolean(proxyHost);

    await this.servicesRepo.update(service.id, {
      enabled: isExposed,
      dnsRecordId: dnsRecord?.id ?? null,
      proxyHostId: proxyHost?.id ?? null,
    });

    return (await this.servicesRepo.findById(service.id))!;
  }

  async syncAll(services: ServiceRecord[]): Promise<{ synced: number; total: number }> {
    const dns = await this.settings.getDnsProvider();
    const proxy = await this.settings.getProxyProvider();
    const baseDomain = await this.getBaseDomain();

    let syncedCount = 0;
    for (const service of services) {
      const wasSynced = await this.syncIfNeeded(service, dns, proxy, baseDomain);
      if (wasSynced) syncedCount++;
    }

    return { synced: syncedCount, total: services.length };
  }

  private async syncIfNeeded(
    service: ServiceRecord,
    dns: Awaited<ReturnType<SettingsService['getDnsProvider']>>,
    proxy: Awaited<ReturnType<SettingsService['getProxyProvider']>>,
    baseDomain: string
  ): Promise<boolean> {
    const fullDomain = this.buildFullDomain(service.subdomain, baseDomain);
    const dnsRecord = dns ? await dns.findByHostname(service.subdomain) : null;
    const proxyHost = proxy ? await proxy.findByDomain(fullDomain) : null;
    const needsSync = this.checkNeedsSync(service, dnsRecord, proxyHost);

    if (!needsSync) return false;

    await this.servicesRepo.update(service.id, {
      enabled: Boolean(dnsRecord) || Boolean(proxyHost),
      dnsRecordId: dnsRecord?.id ?? null,
      proxyHostId: proxyHost?.id ?? null,
    });
    return true;
  }

  private checkNeedsSync(
    service: ServiceRecord,
    dnsRecord: DnsRecord | null,
    proxyHost: ProxyHost | null
  ): boolean {
    const isExposed = Boolean(dnsRecord) || Boolean(proxyHost);
    const dnsIdMatch = service.dnsRecordId === (dnsRecord?.id ?? null);
    const proxyIdMatch = service.proxyHostId === (proxyHost?.id ?? null);
    return service.enabled !== isExposed || !dnsIdMatch || !proxyIdMatch;
  }

  private buildFullDomain(subdomain: string, baseDomain: string): string {
    return baseDomain ? `${subdomain}.${baseDomain}` : subdomain;
  }

  private async fetchProviderData(): Promise<ProviderData> {
    const dnsConfig = await this.settings.getDnsConfig();
    const dns = await this.settings.getDnsProvider();
    const proxy = await this.settings.getProxyProvider();

    let dnsRecords: DnsRecord[] = [];
    let proxyHosts: ProxyHost[] = [];

    try {
      dnsRecords = dns ? await dns.listRecords() : [];
    } catch (error) {
      logger.error({ error }, 'Failed to fetch DNS records');
    }

    try {
      proxyHosts = proxy ? await proxy.listHosts() : [];
    } catch (error) {
      logger.error({ error }, 'Failed to fetch proxy hosts');
    }

    return {
      dnsRecords,
      proxyHosts,
      baseDomain: dnsConfig?.config.domain || '',
    };
  }

  private buildStatus(svc: ServiceRecord, data: ProviderData): SyncStatus {
    const fullDomain = data.baseDomain ? `${svc.subdomain}.${data.baseDomain}` : svc.subdomain;
    const dnsMatch = data.dnsRecords.find(r => r.hostname === svc.subdomain && r.type === 'A');
    const proxyMatch = data.proxyHosts.find(h => h.domain === fullDomain);

    const dbEnabled = Boolean(svc.enabled);
    const hasDns = Boolean(dnsMatch);
    const hasProxy = Boolean(proxyMatch);
    const isSynced = dbEnabled === (hasDns || hasProxy) && Boolean(svc.dnsRecordId) === hasDns;

    return {
      id: svc.id,
      name: svc.name,
      subdomain: svc.subdomain,
      dbState: { enabled: dbEnabled, dnsRecordId: svc.dnsRecordId, proxyHostId: svc.proxyHostId },
      providerState: {
        hasDns,
        hasProxy,
        dnsId: dnsMatch?.id ?? null,
        proxyId: proxyMatch?.id ?? null,
      },
      isSynced,
    };
  }

  async detectExistingConfigurations(services: ServiceRecord[]): Promise<void> {
    const data = await this.fetchProviderData();

    for (const service of services) {
      await this.detectServiceConfiguration(service, data);
    }
  }

  private async detectServiceConfiguration(
    service: ServiceRecord,
    data: ProviderData
  ): Promise<void> {
    const fullDomain = this.buildFullDomain(service.subdomain, data.baseDomain);
    const dnsRecord = data.dnsRecords.find(r => r.hostname === service.subdomain && r.type === 'A');
    const proxyHost = data.proxyHosts.find(h => h.domain === fullDomain);

    const dnsExists = Boolean(dnsRecord);
    const proxyExists = Boolean(proxyHost);
    const warnings = this.detectConfigWarnings(service, proxyHost || null);

    const exposureSource = this.determineExposureSource(service, dnsExists, proxyExists);
    const exposedSubdomain = proxyHost
      ? this.extractSubdomain(proxyHost.domain, data.baseDomain)
      : null;

    await this.servicesRepo.update(service.id, {
      exposureSource,
      dnsExists,
      proxyExists,
      configWarnings: warnings.length > 0 ? JSON.stringify(warnings) : null,
      exposedSubdomain,
      dnsRecordId: dnsRecord?.id ?? service.dnsRecordId,
      proxyHostId: proxyHost?.id ?? service.proxyHostId,
    });
  }

  private determineExposureSource(
    service: ServiceRecord,
    dnsExists: boolean,
    proxyExists: boolean
  ): string | null {
    if (!service.enabled && (dnsExists || proxyExists)) {
      return 'discovered';
    }
    if (service.enabled) {
      return service.exposureSource || 'manual';
    }
    return null;
  }

  private detectConfigWarnings(service: ServiceRecord, proxyHost: ProxyHost | null): string[] {
    const warnings: string[] = [];

    if (!proxyHost) return warnings;

    if (proxyHost.targetPort !== service.port) {
      warnings.push('port_mismatch');
    }

    const proxyScheme = proxyHost.ssl ? 'https' : 'http';
    if (proxyScheme !== service.scheme) {
      warnings.push('scheme_mismatch');
    }

    if (proxyHost.targetHost !== service.sourceId) {
      warnings.push('ip_mismatch');
    }

    return warnings;
  }

  private extractSubdomain(fullDomain: string, baseDomain: string): string {
    if (!baseDomain) return fullDomain;
    return fullDomain.replace(`.${baseDomain}`, '');
  }

  private async getBaseDomain(): Promise<string> {
    const cfg = await this.settings.getDnsConfig();
    return cfg?.config.domain || '';
  }
}
