import type { DnsRecord } from '../dns/dns.types.js';
import type { ProxyHost } from '../proxy/proxy.types.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { ServiceRecord, ServicesRepository } from './services.repository.js';
import type { DockerDiscoveryProvider } from '../discovery/docker.js';
import { createLogger } from '../../core/logger/index.js';
import { fuzzyMatchSubdomain, isCleanerSubdomain, getExposedSubdomain } from './sync-helpers.js';
import { isPortExposedByContainer } from './port-validator.js';

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

type ProviderData = { dnsRecords: DnsRecord[]; proxyHosts: ProxyHost[]; baseDomain: string };
type ServiceUpdate = {
  exposureSource: string | null;
  dnsExists: boolean;
  proxyExists: boolean;
  configWarnings: string | null;
  exposedSubdomain: string | null;
  dnsRecordId: string | null;
  proxyHostId: string | null;
  enabled: boolean;
  sslPending: boolean | null;
  sslError: string | null;
  subdomain?: string;
};

export class SyncService {
  constructor(
    private servicesRepo: ServicesRepository,
    private settings: SettingsService,
    private dockerProvider?: DockerDiscoveryProvider
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
    const exposedSubdomain = getExposedSubdomain(proxyHost, baseDomain);
    const warnings = await this.detectConfigMismatches(
      service,
      proxyHost ?? undefined,
      exposedSubdomain
    );
    await this.servicesRepo.update(service.id, {
      enabled: isExposed,
      dnsRecordId: dnsRecord?.id ?? null,
      proxyHostId: proxyHost?.id ?? null,
      configWarnings: warnings.length > 0 ? JSON.stringify(warnings) : null,
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
      const { dnsRecord, proxyHost, needsSync } = await this.getSyncData(
        service,
        dns,
        proxy,
        baseDomain
      );
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

  private async getSyncData(
    service: ServiceRecord,
    dns: Awaited<ReturnType<SettingsService['getDnsProvider']>>,
    proxy: Awaited<ReturnType<SettingsService['getProxyProvider']>>,
    baseDomain: string
  ): Promise<{ dnsRecord: DnsRecord | null; proxyHost: ProxyHost | null; needsSync: boolean }> {
    const fullDomain = baseDomain ? `${service.subdomain}.${baseDomain}` : service.subdomain;
    const dnsRecord = dns ? await dns.findByHostname(service.subdomain) : null;
    const proxyHost = proxy ? await proxy.findByDomain(fullDomain) : null;
    const isExposed = Boolean(dnsRecord) || Boolean(proxyHost);
    const needsSync =
      service.enabled !== isExposed ||
      service.dnsRecordId !== (dnsRecord?.id ?? null) ||
      service.proxyHostId !== (proxyHost?.id ?? null);
    return { dnsRecord, proxyHost, needsSync };
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

    const hasDns = Boolean(dnsMatch);
    const hasProxy = Boolean(proxyMatch);
    return {
      id: svc.id,
      name: svc.name,
      subdomain: svc.subdomain,
      dbState: {
        enabled: Boolean(svc.enabled),
        dnsRecordId: svc.dnsRecordId,
        proxyHostId: svc.proxyHostId,
      },
      providerState: {
        hasDns,
        hasProxy,
        dnsId: dnsMatch?.id ?? null,
        proxyId: proxyMatch?.id ?? null,
      },
      isSynced:
        Boolean(svc.enabled) === (hasDns || hasProxy) && Boolean(svc.dnsRecordId) === hasDns,
    };
  }

  async detectExistingConfigurations(services: ServiceRecord[]): Promise<void> {
    const data = await this.fetchProviderData();

    for (const service of services) {
      await this.detectServiceConfiguration(service, data);
    }
  }

  private findMatchingDnsRecord(
    service: ServiceRecord,
    records: DnsRecord[],
    baseDomain: string
  ): DnsRecord | undefined {
    const exactDomain = baseDomain ? `${service.subdomain}.${baseDomain}` : service.subdomain;
    const exactMatch = records.find(r => r.hostname === exactDomain && r.type === 'A');
    if (exactMatch) return exactMatch;

    return records.find(r => {
      if (r.type !== 'A') return false;
      const recordSub = baseDomain ? r.hostname.replace(`.${baseDomain}`, '') : r.hostname;
      return recordSub && fuzzyMatchSubdomain(recordSub, service.name);
    });
  }

  private findMatchingProxyHost(
    service: ServiceRecord,
    hosts: ProxyHost[],
    baseDomain: string
  ): ProxyHost | undefined {
    const exactDomain = baseDomain ? `${service.subdomain}.${baseDomain}` : service.subdomain;
    const exactMatch = hosts.find(h => h.domain === exactDomain);
    if (exactMatch) return exactMatch;

    const fuzzyMatch = hosts.find(h => {
      const hostSub = baseDomain ? h.domain.replace(`.${baseDomain}`, '') : h.domain;
      return hostSub && fuzzyMatchSubdomain(hostSub, service.name);
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
      ? data.baseDomain
        ? proxyHost.domain.replace(`.${data.baseDomain}`, '')
        : proxyHost.domain
      : null;

    if (proxyHost && exposedSubdomain && exposedSubdomain !== service.subdomain) {
      const fullDomain = data.baseDomain
        ? `${exposedSubdomain}.${data.baseDomain}`
        : exposedSubdomain;
      dnsRecord = data.dnsRecords.find(r => r.hostname === fullDomain && r.type === 'A');
    }

    const updateData = await this.buildServiceUpdate(
      service,
      dnsRecord,
      proxyHost,
      exposedSubdomain
    );
    await this.servicesRepo.update(service.id, updateData);
  }

  private async buildServiceUpdate(
    service: ServiceRecord,
    dnsRecord: DnsRecord | undefined,
    proxyHost: ProxyHost | undefined,
    exposedSubdomain: string | null
  ): Promise<ServiceUpdate> {
    const dnsExists = Boolean(dnsRecord);
    const proxyExists = Boolean(proxyHost);
    const needsUpdate = Boolean(exposedSubdomain && exposedSubdomain !== service.subdomain);
    const shouldAutoAdopt = this.shouldAutoAdoptSubdomain(service, needsUpdate, exposedSubdomain);
    const warnings = await this.detectConfigMismatches(service, proxyHost, exposedSubdomain, {
      autoAdopting: shouldAutoAdopt,
    });
    const shouldUpdateSubdomain =
      needsUpdate && (shouldAutoAdopt || !warnings.includes('subdomain_mismatch'));
    const baseUpdate = this.createBaseUpdate({
      service,
      dnsRecord,
      proxyHost,
      exposedSubdomain,
      dnsExists,
      proxyExists,
      warnings,
    });
    return {
      ...baseUpdate,
      ...(shouldUpdateSubdomain && exposedSubdomain && { subdomain: exposedSubdomain }),
    };
  }

  private createBaseUpdate(config: {
    service: ServiceRecord;
    dnsRecord: DnsRecord | undefined;
    proxyHost: ProxyHost | undefined;
    exposedSubdomain: string | null;
    dnsExists: boolean;
    proxyExists: boolean;
    warnings: string[];
  }): Omit<ServiceUpdate, 'subdomain'> {
    return {
      exposureSource: this.determineExposureSource(
        config.service,
        config.dnsExists,
        config.proxyExists
      ),
      dnsExists: config.dnsExists,
      proxyExists: config.proxyExists,
      configWarnings: config.warnings.length > 0 ? JSON.stringify(config.warnings) : null,
      exposedSubdomain: config.exposedSubdomain,
      dnsRecordId: config.dnsRecord?.id ?? (config.dnsExists ? config.service.dnsRecordId : null),
      proxyHostId: config.proxyHost?.id ?? (config.proxyExists ? config.service.proxyHostId : null),
      enabled: config.dnsExists && config.proxyExists,
      sslPending: config.proxyHost?.sslPending ?? null,
      sslError: config.proxyHost?.sslError ?? null,
    };
  }

  private shouldAutoAdoptSubdomain(
    service: ServiceRecord,
    needsUpdate: boolean,
    exposedSubdomain: string | null
  ): boolean {
    if (service.labelMismatchIgnored) return false;
    if (!needsUpdate || service.hasExplicitSubdomainLabel) return false;
    return isCleanerSubdomain(exposedSubdomain!, service.subdomain);
  }

  private async detectConfigMismatches(
    service: ServiceRecord,
    proxyHost: ProxyHost | undefined,
    newExposedSubdomain: string | null,
    opts: { autoAdopting?: boolean } = {}
  ): Promise<string[]> {
    if (!proxyHost) return [];
    const warnings = [];

    if (proxyHost.targetPort !== service.port) {
      const exposed = await isPortExposedByContainer(
        service.sourceId,
        proxyHost.targetPort,
        this.dockerProvider
      );
      if (!exposed) {
        warnings.push('port_mismatch');
      }
    }

    const hasSubdomainMismatch = newExposedSubdomain && newExposedSubdomain !== service.subdomain;
    const skipWarning = opts.autoAdopting || service.labelMismatchIgnored;
    if (hasSubdomainMismatch && !skipWarning) warnings.push('subdomain_mismatch');
    return warnings;
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
    if (!service.enabled && (dnsExists || proxyExists)) return 'discovered';
    if (service.enabled) return service.exposureSource || 'manual';
    return null;
  }

  private async getBaseDomain(): Promise<string> {
    const cfg = await this.settings.getDnsConfig();
    return cfg?.config.domain || '';
  }

  async detectOrphans(containerIds: string[]): Promise<ServiceRecord[]> {
    const allServices = await this.servicesRepo.findAll();
    const containerIdSet = new Set(containerIds);
    return allServices.filter(
      s =>
        ['manual', 'auto'].includes(s.exposureSource || '') &&
        s.sourceId &&
        !containerIdSet.has(s.sourceId) &&
        s.enabled &&
        (s.dnsRecordId || s.proxyHostId)
    );
  }
}
