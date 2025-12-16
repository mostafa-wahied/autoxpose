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

  async expose(serviceId: string): Promise<ExposeResult> {
    const service = await this.context.servicesRepo.findById(serviceId);
    if (!service) throw new Error('Service not found');

    await this.updateSchemeIfNeeded(serviceId, service);

    const { dnsRecordId, proxyHostId } = await this.createProviderResources(service);
    if (!dnsRecordId && !proxyHostId) throw new Error('No providers configured');

    await this.context.servicesRepo.update(serviceId, {
      enabled: true,
      dnsRecordId: dnsRecordId ?? null,
      proxyHostId: proxyHostId ?? null,
      exposureSource: 'manual',
    });

    const updated = await this.context.servicesRepo.findById(serviceId);
    if (this.context.sync && updated) {
      await this.context.sync.detectExistingConfigurations([updated]);
    }

    return { service: updated!, dnsRecordId, proxyHostId };
  }

  private async updateSchemeIfNeeded(serviceId: string, service: ServiceRecord): Promise<void> {
    const scheme = await this.determineScheme(service);
    if (scheme !== service.scheme) {
      await this.context.servicesRepo.update(serviceId, { scheme });
      logger.info({ serviceId, detectedScheme: scheme }, 'Updated scheme from health check');
    }
  }

  private async createProviderResources(
    service: ServiceRecord
  ): Promise<{ dnsRecordId?: string; proxyHostId?: string }> {
    const baseDomain = await this.getBaseDomain();
    const fullDomain = this.buildFullDomain(service.subdomain, baseDomain);

    const dnsRecordId = service.dnsRecordId ?? (await this.createDnsRecord(service));
    const proxyHostId = service.proxyHostId ?? (await this.createProxyHost(service, fullDomain));

    return { dnsRecordId, proxyHostId };
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

    await this.removeDnsRecord(service);
    await this.removeProxyHost(service);

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
  ): Promise<string | undefined> {
    const proxy = await this.context.settings.getProxyProvider();
    if (!proxy) return undefined;

    const host = await proxy.createHost({
      domain: fullDomain,
      targetHost: this.context.lanIp,
      targetPort: svc.port,
      targetScheme: (svc.scheme as 'http' | 'https') || 'http',
      ssl: true,
    });
    return host.id;
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

  private extractSubdomain(subdomain: string): string {
    const parts = subdomain.split('.');
    return parts.length > 2 ? parts[0] : subdomain;
  }
}
