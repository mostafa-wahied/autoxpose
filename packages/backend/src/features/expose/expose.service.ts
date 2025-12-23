import { testBackendScheme } from './scheme-detection.js';
import type { ServiceRecord, ServicesRepository } from '../services/services.repository.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { SyncService } from '../services/sync.service.js';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('expose-service');

type ExposeResult = { service: ServiceRecord; dnsRecordId?: string; proxyHostId?: string };

type ExposeContext = {
  servicesRepo: ServicesRepository;
  settings: SettingsService;
  publicIp: string;
  lanIp: string;
  sync?: SyncService;
};

export class ExposeService {
  private context: ExposeContext;

  constructor(context: ExposeContext) {
    this.context = context;
  }

  async expose(serviceId: string, isAutoExpose = false): Promise<ExposeResult> {
    const service = await this.context.servicesRepo.findById(serviceId);
    if (!service) throw new Error('Service not found');

    await this.updateSchemeIfNeeded(serviceId, service);

    const { dnsRecordId, proxyHostId, sslPending, sslError } =
      await this.createProviderResources(service);
    if (!dnsRecordId && !proxyHostId) throw new Error('No providers configured');

    await this.updateServiceWithProviderResources(
      serviceId,
      { dnsRecordId, proxyHostId, sslPending, sslError },
      isAutoExpose
    );

    const updated = await this.context.servicesRepo.findById(serviceId);
    if (this.context.sync && updated) {
      await this.context.sync.detectExistingConfigurations([updated]);
    }

    return { service: updated!, dnsRecordId, proxyHostId };
  }

  private async updateServiceWithProviderResources(
    serviceId: string,
    resources: {
      dnsRecordId?: string;
      proxyHostId?: string;
      sslPending?: boolean;
      sslError?: string;
    },
    isAutoExpose: boolean
  ): Promise<void> {
    await this.context.servicesRepo.update(serviceId, {
      enabled: true,
      dnsRecordId: resources.dnsRecordId ?? null,
      proxyHostId: resources.proxyHostId ?? null,
      exposureSource: isAutoExpose ? 'auto' : 'manual',
      sslPending: resources.sslPending ?? null,
      sslError: resources.sslError ?? null,
    });
  }

  private async updateSchemeIfNeeded(serviceId: string, service: ServiceRecord): Promise<void> {
    const scheme = await this.determineScheme(service);
    if (scheme !== service.scheme) {
      await this.context.servicesRepo.update(serviceId, { scheme });
      logger.info({ serviceId, detectedScheme: scheme }, 'Updated scheme from health check');
    }
  }

  private async createProviderResources(
    service: ServiceRecord,
    forceCreate = false
  ): Promise<{
    dnsRecordId?: string;
    proxyHostId?: string;
    sslPending?: boolean;
    sslError?: string;
  }> {
    const baseDomain = await this.getBaseDomain();
    const fullDomain = this.buildFullDomain(service.subdomain, baseDomain);

    const dnsRecordId =
      !forceCreate && service.dnsRecordId
        ? service.dnsRecordId
        : await this.createDnsRecord(service);
    const proxyResult =
      !forceCreate && service.proxyHostId !== null
        ? { id: service.proxyHostId }
        : await this.createProxyHost(service, fullDomain);

    return {
      dnsRecordId,
      proxyHostId: proxyResult?.id,
      sslPending: proxyResult?.sslPending,
      sslError: proxyResult?.sslError,
    };
  }

  private async determineScheme(service: ServiceRecord): Promise<string> {
    const detected = await testBackendScheme(
      this.context.lanIp,
      service.port,
      service.scheme ?? undefined
    );
    if (detected) {
      logger.info(
        { serviceId: service.id, port: service.port, currentScheme: service.scheme, detected },
        'Health check detected scheme'
      );
      return detected;
    }
    logger.info(
      { serviceId: service.id, port: service.port, fallback: service.scheme },
      'Health check failed, using current scheme'
    );
    return service.scheme || 'http';
  }

  async unexpose(serviceId: string): Promise<ServiceRecord> {
    const service = await this.context.servicesRepo.findById(serviceId);
    if (!service) throw new Error('Service not found');

    try {
      await this.removeDnsRecord(service);
    } catch (error) {
      logger.error({ serviceId, error }, 'Failed to delete DNS record');
    }

    try {
      await this.removeProxyHost(service);
    } catch (error) {
      logger.error({ serviceId, error }, 'Failed to delete proxy host');
    }

    await this.context.servicesRepo.update(serviceId, {
      enabled: false,
      dnsRecordId: null,
      proxyHostId: null,
      exposureSource: null,
    });

    const updated = await this.context.servicesRepo.findById(serviceId);

    if (this.context.sync && updated) {
      await this.context.sync.detectExistingConfigurations([updated]);
    }

    return updated!;
  }

  async exposeDnsOnly(serviceId: string): Promise<ExposeResult> {
    const service = await this.context.servicesRepo.findById(serviceId);
    if (!service) throw new Error('Service not found');
    if (service.dnsRecordId && service.dnsExists) throw new Error('DNS record already exists');

    const dnsRecordId = await this.createDnsRecord(service);
    if (!dnsRecordId) throw new Error('No DNS provider configured');

    await this.context.servicesRepo.update(serviceId, {
      dnsRecordId,
      dnsExists: true,
    });

    const updated = await this.context.servicesRepo.findById(serviceId);
    if (this.context.sync && updated) {
      await this.context.sync.detectExistingConfigurations([updated]);
    }

    return { service: updated!, dnsRecordId };
  }

  async exposeProxyOnly(serviceId: string): Promise<ExposeResult> {
    const service = await this.context.servicesRepo.findById(serviceId);
    if (!service) throw new Error('Service not found');
    if (service.proxyHostId) throw new Error('Proxy host already exists');

    await this.updateSchemeIfNeeded(serviceId, service);
    const updatedService = await this.context.servicesRepo.findById(serviceId);
    if (!updatedService) throw new Error('Service not found after scheme update');

    const baseDomain = await this.getBaseDomain();
    const fullDomain = this.buildFullDomain(updatedService.subdomain, baseDomain);
    const proxyResult = await this.createProxyHost(updatedService, fullDomain);
    if (!proxyResult) throw new Error('No proxy provider configured');

    await this.context.servicesRepo.update(serviceId, {
      proxyHostId: proxyResult.id,
      proxyExists: true,
      sslPending: proxyResult.sslPending ?? null,
      sslError: proxyResult.sslError ?? null,
    });

    const updated = await this.context.servicesRepo.findById(serviceId);
    if (this.context.sync && updated) {
      await this.context.sync.detectExistingConfigurations([updated]);
    }

    return {
      service: updated!,
      proxyHostId: proxyResult.id,
    };
  }

  private async getBaseDomain(): Promise<string | null> {
    const cfg = await this.context.settings.getDnsConfig();
    return cfg?.config.domain ?? null;
  }

  private buildFullDomain(subdomain: string, baseDomain: string | null): string {
    if (!baseDomain) return subdomain;
    if (subdomain.endsWith(baseDomain)) return subdomain;
    return `${subdomain}.${baseDomain}`;
  }

  private async createDnsRecord(svc: ServiceRecord): Promise<string | undefined> {
    const dns = await this.context.settings.getDnsProvider();
    if (!dns) return undefined;

    const subdomain = this.extractSubdomain(svc.subdomain);
    const record = await dns.createRecord({ subdomain, ip: this.context.publicIp });
    return record.id;
  }

  private async createProxyHost(
    svc: ServiceRecord,
    fullDomain: string
  ): Promise<{ id: string; sslPending?: boolean; sslError?: string } | undefined> {
    const proxy = await this.context.settings.getProxyProvider();
    if (!proxy) return undefined;

    const host = await proxy.createHost({
      domain: fullDomain,
      targetHost: this.context.lanIp,
      targetPort: svc.port,
      targetScheme: (svc.scheme as 'http' | 'https') || 'http',
      ssl: true,
    });
    return { id: host.id, sslPending: host.sslPending, sslError: host.sslError };
  }

  private async removeDnsRecord(svc: ServiceRecord): Promise<void> {
    if (!svc.dnsRecordId) return;
    const dns = await this.context.settings.getDnsProvider();
    if (dns) await dns.deleteRecord(svc.dnsRecordId);
  }

  private async removeProxyHost(svc: ServiceRecord): Promise<void> {
    if (!svc.proxyHostId) return;
    const proxy = await this.context.settings.getProxyProvider();
    if (proxy) await proxy.deleteHost(svc.proxyHostId);
  }

  async migrateSubdomain(
    serviceId: string,
    targetSubdomain: string
  ): Promise<{ service: ServiceRecord; oldSubdomain: string; newSubdomain: string }> {
    const service = await this.context.servicesRepo.findById(serviceId);
    if (!service) throw new Error('Service not found');

    const isKeepingExposed = targetSubdomain === service.exposedSubdomain;
    if (isKeepingExposed) {
      return this.alignToExposedSubdomain(service, targetSubdomain);
    }
    return this.performProviderMigration(service, targetSubdomain);
  }

  private async alignToExposedSubdomain(
    service: ServiceRecord,
    targetSubdomain: string
  ): Promise<{ service: ServiceRecord; oldSubdomain: string; newSubdomain: string }> {
    const oldSubdomain = service.subdomain;
    logger.info({ serviceId: service.id, oldSubdomain, targetSubdomain }, 'Aligning to exposed');
    await this.context.servicesRepo.update(service.id, {
      subdomain: targetSubdomain,
      configWarnings: null,
      hasExplicitSubdomainLabel: false,
      labelMismatchIgnored: true,
    });
    const updated = await this.context.servicesRepo.findById(service.id);
    return { service: updated!, oldSubdomain, newSubdomain: targetSubdomain };
  }

  private async performProviderMigration(
    service: ServiceRecord,
    targetSubdomain: string
  ): Promise<{ service: ServiceRecord; oldSubdomain: string; newSubdomain: string }> {
    const oldSubdomain = service.subdomain;
    const oldDnsId = service.dnsRecordId;
    const oldProxyId = service.proxyHostId;
    logger.info({ serviceId: service.id, oldSubdomain, targetSubdomain }, 'Migrating providers');

    const fresh = { ...service, subdomain: targetSubdomain, dnsRecordId: null, proxyHostId: null };
    const res = await this.createProviderResources(fresh, true);
    if (!res.dnsRecordId && !res.proxyHostId) throw new Error('Failed to create new resources');

    await this.updateServiceForMigration(service.id, targetSubdomain, res);

    if (res.proxyHostId) await this.tryImmediateSsl(service.id, res.proxyHostId, targetSubdomain);
    await this.deleteOldResources(oldDnsId, oldProxyId);

    const updated = await this.context.servicesRepo.findById(service.id);
    return { service: updated!, oldSubdomain, newSubdomain: targetSubdomain };
  }

  private async updateServiceForMigration(
    serviceId: string,
    targetSubdomain: string,
    res: { dnsRecordId?: string; proxyHostId?: string; sslPending?: boolean; sslError?: string }
  ): Promise<void> {
    try {
      await this.context.servicesRepo.update(serviceId, {
        subdomain: targetSubdomain,
        dnsRecordId: res.dnsRecordId ?? null,
        proxyHostId: res.proxyHostId ?? null,
        exposedSubdomain: targetSubdomain,
        configWarnings: null,
        sslPending: res.sslPending ?? null,
        sslError: res.sslError ?? null,
      });
    } catch (err) {
      await this.rollbackMigration(res.dnsRecordId, res.proxyHostId);
      throw err;
    }
  }

  private async rollbackMigration(
    dnsRecordId: string | undefined,
    proxyHostId: string | undefined
  ): Promise<void> {
    logger.warn({ dnsRecordId, proxyHostId }, 'Rolling back migration');
    if (dnsRecordId) {
      const dns = await this.context.settings.getDnsProvider();
      if (dns) await dns.deleteRecord(dnsRecordId).catch(() => {});
    }
    if (proxyHostId) {
      const proxy = await this.context.settings.getProxyProvider();
      if (proxy) await proxy.deleteHost(proxyHostId).catch(() => {});
    }
  }

  private async deleteOldResources(
    dnsRecordId: string | null,
    proxyHostId: string | null
  ): Promise<void> {
    if (dnsRecordId) {
      const dns = await this.context.settings.getDnsProvider();
      if (dns) await dns.deleteRecord(dnsRecordId);
    }
    if (proxyHostId) {
      const proxy = await this.context.settings.getProxyProvider();
      if (proxy) await proxy.deleteHost(proxyHostId);
    }
  }

  private extractSubdomain(subdomain: string): string {
    const parts = subdomain.split('.');
    return parts.length > 2 ? parts[0] : subdomain;
  }

  private async tryImmediateSsl(
    serviceId: string,
    proxyHostId: string,
    subdomain: string
  ): Promise<void> {
    const baseDomain = await this.getBaseDomain();
    const fullDomain = this.buildFullDomain(subdomain, baseDomain);
    const proxy = await this.context.settings.getProxyProvider();
    if (!proxy) return;
    const result = await proxy.retrySsl(proxyHostId, fullDomain);
    await this.context.servicesRepo.update(serviceId, {
      sslPending: result.success ? false : true,
      sslError: result.success ? null : result.error || 'SSL setup failed',
    });
  }
}
