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
    if (service.dnsRecordId) throw new Error('DNS record already exists');

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

  async migrateSubdomain(serviceId: string): Promise<{
    service: ServiceRecord;
    oldSubdomain: string;
    newSubdomain: string;
  }> {
    const service = await this.context.servicesRepo.findById(serviceId);
    if (!service) throw new Error('Service not found');

    const oldSubdomain = service.subdomain;
    const newSubdomain = service.exposedSubdomain as string;
    const oldDnsRecordId = service.dnsRecordId;
    const oldProxyHostId = service.proxyHostId;

    logger.info({ serviceId, oldSubdomain, newSubdomain }, 'Starting subdomain migration');

    const freshService = { ...service, dnsRecordId: null, proxyHostId: null };
    const { dnsRecordId, proxyHostId, sslPending, sslError } = await this.createProviderResources(
      freshService,
      true
    );

    if (!dnsRecordId && !proxyHostId) {
      throw new Error('Failed to create new resources');
    }

    try {
      await this.context.servicesRepo.update(serviceId, {
        dnsRecordId: dnsRecordId ?? null,
        proxyHostId: proxyHostId ?? null,
        exposedSubdomain: newSubdomain,
        configWarnings: null,
        sslPending: sslPending ?? null,
        sslError: sslError ?? null,
      });
    } catch (err) {
      await this.rollbackMigration(dnsRecordId, proxyHostId);
      throw err;
    }

    if (proxyHostId) await this.tryImmediateSsl(serviceId, proxyHostId, newSubdomain);

    await this.deleteOldResources(oldDnsRecordId, oldProxyHostId);

    const updated = await this.context.servicesRepo.findById(serviceId);
    logger.info({ serviceId, oldSubdomain, newSubdomain }, 'Subdomain migration completed');

    return { service: updated!, oldSubdomain, newSubdomain };
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
