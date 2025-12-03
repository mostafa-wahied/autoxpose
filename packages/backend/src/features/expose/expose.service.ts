import type { ServiceRecord, ServicesRepository } from '../services/services.repository.js';
import type { SettingsService } from '../settings/settings.service.js';

type ExposeResult = { service: ServiceRecord; dnsRecordId?: string; proxyHostId?: string };

export class ExposeService {
  constructor(
    private servicesRepo: ServicesRepository,
    private settings: SettingsService,
    private publicIp: string,
    private lanIp: string
  ) {}

  async expose(serviceId: string): Promise<ExposeResult> {
    const service = await this.servicesRepo.findById(serviceId);
    if (!service) throw new Error('Service not found');

    const dnsRecordId = service.dnsRecordId
      ? service.dnsRecordId
      : await this.createDnsRecord(service);

    const proxyHostId = service.proxyHostId
      ? service.proxyHostId
      : await this.createProxyHost(service);

    await this.servicesRepo.update(serviceId, {
      enabled: true,
      dnsRecordId: dnsRecordId ?? null,
      proxyHostId: proxyHostId ?? null,
    });

    const updated = await this.servicesRepo.findById(serviceId);
    return { service: updated!, dnsRecordId, proxyHostId };
  }

  async unexpose(serviceId: string): Promise<ServiceRecord> {
    const service = await this.servicesRepo.findById(serviceId);
    if (!service) throw new Error('Service not found');

    await this.removeDnsRecord(service);
    await this.removeProxyHost(service);

    await this.servicesRepo.update(serviceId, {
      enabled: false,
      dnsRecordId: null,
      proxyHostId: null,
    });

    return (await this.servicesRepo.findById(serviceId))!;
  }

  private async createDnsRecord(svc: ServiceRecord): Promise<string | undefined> {
    const dns = await this.settings.getDnsProvider();
    if (!dns) return undefined;

    const subdomain = this.extractSubdomain(svc.domain);
    const record = await dns.createRecord({ subdomain, ip: this.publicIp });
    return record.id;
  }

  private async createProxyHost(svc: ServiceRecord): Promise<string | undefined> {
    const proxy = await this.settings.getProxyProvider();
    if (!proxy) return undefined;

    const host = await proxy.createHost({
      domain: svc.domain,
      targetHost: this.lanIp,
      targetPort: svc.port,
      targetScheme: (svc.scheme as 'http' | 'https') || 'http',
      ssl: true,
    });
    return host.id;
  }

  private async removeDnsRecord(svc: ServiceRecord): Promise<void> {
    if (!svc.dnsRecordId) return;
    const dns = await this.settings.getDnsProvider();
    if (dns) await dns.deleteRecord(svc.dnsRecordId);
  }

  private async removeProxyHost(svc: ServiceRecord): Promise<void> {
    if (!svc.proxyHostId) return;
    const proxy = await this.settings.getProxyProvider();
    if (proxy) await proxy.deleteHost(svc.proxyHostId);
  }

  private extractSubdomain(domain: string): string {
    const parts = domain.split('.');
    return parts.length > 2 ? parts[0] : domain;
  }
}
