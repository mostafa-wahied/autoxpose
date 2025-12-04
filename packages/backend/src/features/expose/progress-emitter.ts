import type { ProgressEvent, ProgressStep } from './progress.types.js';

export type ProgressCallback = (event: ProgressEvent) => void;

export interface ExposeContext {
  serviceId: string;
  action: 'expose' | 'unexpose';
  steps: ProgressStep[];
  onProgress: ProgressCallback;
}

/**Emit a progress event */
export function emit(ctx: ExposeContext, updates?: Partial<ProgressEvent>): void {
  ctx.onProgress({
    type: 'progress',
    serviceId: ctx.serviceId,
    action: ctx.action,
    steps: [...ctx.steps],
    timestamp: Date.now(),
    ...updates,
  });
}

/**Emit a completion event */
export function emitComplete(
  ctx: ExposeContext,
  domain: string,
  ids: { dns?: string; proxy?: string },
  ssl?: { pending?: boolean; error?: string }
): void {
  ctx.onProgress({
    type: 'complete',
    serviceId: ctx.serviceId,
    action: ctx.action,
    steps: ctx.steps,
    timestamp: Date.now(),
    result: {
      success: true,
      domain,
      dnsRecordId: ids.dns,
      proxyHostId: ids.proxy,
      sslPending: ssl?.pending,
      sslError: ssl?.error,
    },
  });
}

/**Emit an error event */
export function emitError(ctx: ExposeContext, error: string): void {
  ctx.onProgress({
    type: 'error',
    serviceId: ctx.serviceId,
    action: ctx.action,
    steps: ctx.steps,
    timestamp: Date.now(),
    result: { success: false, error },
  });
}
