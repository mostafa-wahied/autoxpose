import type { ServicesRepository } from '../services/services.repository.js';
import type { SettingsService } from '../settings/settings.service.js';
import {
  handleDnsExpose,
  handleDnsUnexpose,
  handleProxyExpose,
  handleProxyUnexpose,
  emit,
  emitComplete,
  emitError,
  type ExposeContext,
  type ProgressCallback,
} from './expose-handlers.js';
import { createInitialSteps } from './progress.types.js';
import { testBackendScheme } from './scheme-detection.js';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('streaming-expose');

export type { ProgressCallback } from './expose-handlers.js';

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

    await this.updateServiceScheme(service);

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

    if (!this.validateExposeResults(ctx, dnsResult, proxyResult)) return;

    await this.handleExposeComplete({
      serviceId,
      fullDomain,
      dnsResult,
      proxyResult,
      ctx,
    });
  }

  private validateExposeResults(
    ctx: ExposeContext,
    dnsResult: { recordId?: string | null },
    proxyResult?: { id: string }
  ): boolean {
    const nothingConfigured = dnsResult.recordId === undefined && proxyResult === undefined;
    if (nothingConfigured) {
      emitError(ctx, 'No providers configured. Set up DNS and Proxy in settings first.');
      return false;
    }
    return true;
  }

  private async handleExposeComplete(options: {
    serviceId: string;
    fullDomain: string;
    dnsResult: { recordId?: string | null };
    proxyResult: { id: string; sslPending?: boolean; sslError?: string } | undefined;
    ctx: ExposeContext;
  }): Promise<void> {
    const { serviceId, fullDomain, dnsResult, proxyResult, ctx } = options;

    await this.servicesRepo.update(serviceId, {
      enabled: true,
      dnsRecordId: dnsResult.recordId || null,
      proxyHostId: proxyResult?.id || null,
      sslPending: proxyResult?.sslPending ?? null,
      sslError: proxyResult?.sslError ?? null,
    });

    const sslStatus = proxyResult
      ? { pending: proxyResult.sslPending, error: proxyResult.sslError }
      : undefined;
    emitComplete(
      ctx,
      fullDomain,
      { dns: dnsResult.recordId ?? undefined, proxy: proxyResult?.id },
      sslStatus
    );
  }

  private async updateServiceScheme(
    service: NonNullable<Awaited<ReturnType<ServicesRepository['findById']>>>
  ): Promise<void> {
    const scheme = await this.determineScheme(service);
    if (scheme !== service.scheme) {
      await this.servicesRepo.update(service.id, { scheme });
      logger.info(
        { serviceId: service.id, detectedScheme: scheme },
        'Updated scheme from health check'
      );
      service.scheme = scheme;
    }
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

  private async determineScheme(
    service: Awaited<ReturnType<ServicesRepository['findById']>>
  ): Promise<string> {
    const detected = await testBackendScheme(
      this.lanIp,
      service!.port,
      service!.scheme ?? undefined
    );
    if (detected) {
      logger.info(
        { serviceId: service!.id, port: service!.port, currentScheme: service!.scheme, detected },
        'Health check detected scheme'
      );
      return detected;
    }
    logger.info(
      { serviceId: service!.id, port: service!.port, fallback: service!.scheme },
      'Health check failed, using current scheme'
    );
    return service!.scheme || 'http';
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
