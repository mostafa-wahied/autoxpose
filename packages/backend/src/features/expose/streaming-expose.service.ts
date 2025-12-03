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

    const dnsId = await handleDnsExpose(ctx, service, this.settings, this.publicIp);
    if (dnsId === null) return;

    const proxyId = await handleProxyExpose(ctx, service, this.settings, this.lanIp);
    if (proxyId === null) return;

    await this.servicesRepo.update(serviceId, {
      enabled: true,
      dnsRecordId: dnsId || null,
      proxyHostId: proxyId || null,
    });

    emitComplete(ctx, service.domain, { dns: dnsId, proxy: proxyId });
  }

  async unexposeWithProgress(serviceId: string, onProgress: ProgressCallback): Promise<void> {
    const service = await this.servicesRepo.findById(serviceId);
    if (!service) {
      emitError(this.createContext(serviceId, 'unexpose', onProgress), 'Service not found');
      return;
    }

    const ctx = this.createContext(serviceId, 'unexpose', onProgress);
    emit(ctx);

    const dnsOk = await handleDnsUnexpose(ctx, service.dnsRecordId, this.settings);
    if (!dnsOk) return;

    const proxyOk = await handleProxyUnexpose(ctx, service.proxyHostId, this.settings);
    if (!proxyOk) return;

    await this.servicesRepo.update(serviceId, {
      enabled: false,
      dnsRecordId: null,
      proxyHostId: null,
    });
    emitComplete(ctx, service.domain, {});
  }

  private createContext(
    serviceId: string,
    action: 'expose' | 'unexpose',
    cb: ProgressCallback
  ): ExposeContext {
    return { serviceId, action, steps: createInitialSteps(action), onProgress: cb };
  }
}
