import type { ServicesRepository } from '../services/services.repository.js';
import type { SettingsService } from '../settings/settings.service.js';
import {
  handleDnsExpose,
  handleDnsUnexpose,
  handleProxyExpose,
  handleProxyUnexpose,
} from './expose-handlers.js';
import {
  emit,
  emitComplete,
  emitError,
  type ExposeContext,
  type ProgressCallback,
} from './progress-emitter.js';
import { createInitialSteps } from './progress.types.js';

export type { ProgressCallback } from './progress-emitter.js';

export class StreamingExposeService {
  constructor(
    private servicesRepo: ServicesRepository,
    private settings: SettingsService,
    private publicIp: string,
    private lanIp: string
  ) {}

  async exposeWithProgress(serviceId: string, onProgress: ProgressCallback): Promise<void> {
    const service = await this.servicesRepo.findById(serviceId);
    if (!service) {
      emitError(this.createContext(serviceId, 'expose', onProgress), 'Service not found');
      return;
    }

    const ctx = this.createContext(serviceId, 'expose', onProgress);
    emit(ctx);

    const baseDomain = await this.getBaseDomain();
    const fullDomain = this.buildFullDomain(service.subdomain, baseDomain);

    const dnsResult = await handleDnsExpose({
      ctx,
      svc: service,
      settings: this.settings,
      publicIp: this.publicIp,
      fullDomain,
    });
    if (dnsResult.recordId === null || !dnsResult.propagationSuccess) return;

    const proxyResult = await handleProxyExpose({
      ctx,
      svc: service,
      fullDomain,
      settings: this.settings,
      lanIp: this.lanIp,
    });
    if (proxyResult === null) return;

    const nothingConfigured = dnsResult.recordId === undefined && proxyResult === undefined;
    if (nothingConfigured) {
      emitError(ctx, 'No providers configured. Set up DNS and Proxy in settings first.');
      return;
    }

    await this.servicesRepo.update(serviceId, {
      enabled: true,
      dnsRecordId: dnsResult.recordId || null,
      proxyHostId: proxyResult?.id || null,
    });

    const sslStatus = proxyResult
      ? { pending: proxyResult.sslPending, error: proxyResult.sslError }
      : undefined;
    emitComplete(ctx, fullDomain, { dns: dnsResult.recordId, proxy: proxyResult?.id }, sslStatus);
  }

  async unexposeWithProgress(serviceId: string, onProgress: ProgressCallback): Promise<void> {
    const service = await this.servicesRepo.findById(serviceId);
    if (!service) {
      emitError(this.createContext(serviceId, 'unexpose', onProgress), 'Service not found');
      return;
    }

    const ctx = this.createContext(serviceId, 'unexpose', onProgress);
    emit(ctx);

    const baseDomain = await this.getBaseDomain();
    const fullDomain = this.buildFullDomain(service.subdomain, baseDomain);

    const dnsOk = await handleDnsUnexpose(ctx, service.dnsRecordId, this.settings);
    if (!dnsOk) return;

    const proxyOk = await handleProxyUnexpose(ctx, service.proxyHostId, this.settings);
    if (!proxyOk) return;

    await this.servicesRepo.update(serviceId, {
      enabled: false,
      dnsRecordId: null,
      proxyHostId: null,
    });
    emitComplete(ctx, fullDomain, {});
  }

  private async getBaseDomain(): Promise<string | null> {
    const cfg = await this.settings.getDnsConfig();
    return cfg?.config.domain ?? null;
  }

  private buildFullDomain(subdomain: string, baseDomain: string | null): string {
    if (!baseDomain) return subdomain;
    if (subdomain.endsWith(baseDomain)) return subdomain;
    return `${subdomain}.${baseDomain}`;
  }

  private createContext(
    serviceId: string,
    action: 'expose' | 'unexpose',
    cb: ProgressCallback
  ): ExposeContext {
    return { serviceId, action, steps: createInitialSteps(action), onProgress: cb };
  }
}
