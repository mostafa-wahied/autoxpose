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
    try {
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
    } catch (error) {
      logger.error({ error, serviceId: service.id }, 'Failed to sync service');
      return false;
    }
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
    const dnsMatch = this.findMatchingDnsRecord(svc, data.dnsRecords, data.baseDomain);
    const proxyMatch = this.findMatchingProxyHost(svc, data.proxyHosts, data.baseDomain);

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

  private fuzzyMatchSubdomain(subdomain: string, containerName: string): boolean {
    const sub = subdomain.toLowerCase();
    const name = containerName.toLowerCase();
    if (name === sub) return true;
    if (name.includes(sub)) return true;
    const parts = name.split(/[-_]/);
    return parts.some(part => part === sub);
  }

  private findMatchingDnsRecord(
    service: ServiceRecord,
    records: DnsRecord[],
    baseDomain: string
  ): DnsRecord | undefined {
    const exactDomain = this.buildFullDomain(service.subdomain, baseDomain);
    const exactMatch = records.find(r => r.hostname === exactDomain && r.type === 'A');
    if (exactMatch) return exactMatch;

    return records.find(r => {
      if (r.type !== 'A') return false;
      const recordSub = this.extractSubdomain(r.hostname, baseDomain);
      return recordSub && this.fuzzyMatchSubdomain(recordSub, service.name);
    });
  }

  private findMatchingProxyHost(
    service: ServiceRecord,
    hosts: ProxyHost[],
    baseDomain: string
  ): ProxyHost | undefined {
    const exactDomain = this.buildFullDomain(service.subdomain, baseDomain);
    const exactMatch = hosts.find(h => h.domain === exactDomain);
    if (exactMatch) return exactMatch;

    const fuzzyMatch = hosts.find(h => {
      const hostSub = this.extractSubdomain(h.domain, baseDomain);
      return hostSub && this.fuzzyMatchSubdomain(hostSub, service.name);
    });
    if (fuzzyMatch) return fuzzyMatch;

    return hosts.find(h => h.targetPort === service.port);
  }

  private async detectServiceConfiguration(
    service: ServiceRecord,
    data: ProviderData
  ): Promise<void> {
    let dnsRecord = this.findMatchingDnsRecord(service, data.dnsRecords, data.baseDomain);
    const proxyHost = this.findMatchingProxyHost(service, data.proxyHosts, data.baseDomain);

    this.logDetectionResults(service, dnsRecord, proxyHost, data);

    const exposedSubdomain = proxyHost
      ? this.extractSubdomain(proxyHost.domain, data.baseDomain)
      : null;

    if (proxyHost && exposedSubdomain && exposedSubdomain !== service.subdomain) {
      const fullDomain = this.buildFullDomain(exposedSubdomain, data.baseDomain);
      dnsRecord = data.dnsRecords.find(r => r.hostname === fullDomain && r.type === 'A');
    }

    const updateData = this.buildServiceUpdate(service, dnsRecord, proxyHost, exposedSubdomain);
    await this.servicesRepo.update(service.id, updateData);
  }

  private buildServiceUpdate(
    service: ServiceRecord,
    dnsRecord: DnsRecord | undefined,
    proxyHost: ProxyHost | undefined,
    exposedSubdomain: string | null
  ): {
    exposureSource: string | null;
    dnsExists: boolean;
    proxyExists: boolean;
    configWarnings: null;
    exposedSubdomain: string | null;
    dnsRecordId: string | null;
    proxyHostId: string | null;
    enabled: boolean;
    sslPending: boolean | null;
    sslError: string | null;
    subdomain?: string;
  } {
    const dnsExists = Boolean(dnsRecord);
    const proxyExists = Boolean(proxyHost);
    const exposureSource = this.determineExposureSource(service, dnsExists, proxyExists);
    const shouldBeEnabled = dnsExists && proxyExists;
    const subdomainNeedsUpdate = exposedSubdomain && exposedSubdomain !== service.subdomain;

    return {
      exposureSource,
      dnsExists,
      proxyExists,
      configWarnings: null,
      exposedSubdomain,
      dnsRecordId: dnsRecord?.id ?? service.dnsRecordId,
      proxyHostId: proxyHost?.id ?? service.proxyHostId,
      enabled: shouldBeEnabled,
      sslPending: proxyHost?.sslPending ?? null,
      sslError: proxyHost?.sslError ?? null,
      ...(subdomainNeedsUpdate && { subdomain: exposedSubdomain }),
    };
  }

  private logDetectionResults(
    service: ServiceRecord,
    dnsRecord: DnsRecord | undefined,
    proxyHost: ProxyHost | undefined,
    data: ProviderData
  ): void {
    logger.debug(
      {
        serviceId: service.id,
        serviceName: service.name,
        subdomain: service.subdomain,
        foundDnsRecord: dnsRecord?.id ?? null,
        foundProxyHost: proxyHost?.id ?? null,
        totalDnsRecords: data.dnsRecords.length,
        totalProxyHosts: data.proxyHosts.length,
      },
      'Sync detection results'
    );
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

  private extractSubdomain(fullDomain: string, baseDomain: string): string {
    if (!baseDomain) return fullDomain;
    return fullDomain.replace(`.${baseDomain}`, '');
  }

  private async getBaseDomain(): Promise<string> {
    const cfg = await this.settings.getDnsConfig();
    return cfg?.config.domain || '';
  }
}
