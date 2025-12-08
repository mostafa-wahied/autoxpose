import type { SettingsService } from '../settings/settings.service.js';
import { waitForDnsPropagation, type PropagationCallback } from './dns-propagation.js';
import { emit, emitError, type ExposeContext } from './progress-emitter.js';
import { finishProxyStep } from './proxy-reachability.js';
import { updateStep } from './progress.types.js';
type DnsService = { subdomain: string; dnsRecordId: string | null };
type ProxyService = {
  subdomain: string;
  port: number;
  scheme: string | null;
  proxyHostId: string | null;
};
type StepType = 'dns' | 'proxy';
function emitSkipped(ctx: ExposeContext, step: StepType, detail: string): void {
  ctx.steps = updateStep(ctx.steps, step, { status: 'success', progress: 100, detail });
  emit(ctx);
}
function emitRunning(ctx: ExposeContext, step: StepType, progress: number, detail: string): void {
  ctx.steps = updateStep(ctx.steps, step, { status: 'running', progress, detail });
  emit(ctx);
}
function emitSuccess(ctx: ExposeContext, step: StepType, detail: string): void {
  ctx.steps = updateStep(ctx.steps, step, { status: 'success', progress: 100, detail });
  emit(ctx);
}
function emitStepError(ctx: ExposeContext, step: StepType, msg: string, prefix: string): void {
  ctx.steps = updateStep(ctx.steps, step, { status: 'error', progress: 100, detail: msg });
  emitError(ctx, `${prefix}: ${msg}`);
}
export type DnsExposeResult = {
  recordId: string | null | undefined;
  propagationSuccess: boolean;
  globalVerified: boolean;
};
type DnsExposeParams = {
  ctx: ExposeContext;
  svc: DnsService;
  settings: SettingsService;
  publicIp: string;
  fullDomain: string;
};
export async function handleDnsExpose(p: DnsExposeParams): Promise<DnsExposeResult> {
  const { ctx, svc, settings, publicIp, fullDomain } = p;
  if (svc.dnsRecordId) {
    emitSkipped(ctx, 'dns', 'Already configured');
    return { recordId: svc.dnsRecordId, propagationSuccess: true, globalVerified: true };
  }
  emitRunning(ctx, 'dns', 5, 'Connecting...');
  try {
    const dns = await settings.getDnsProvider();
    if (!dns) {
      emitSkipped(ctx, 'dns', 'Skipped');
      return { recordId: undefined, propagationSuccess: true, globalVerified: true };
    }
    const subdomain = svc.subdomain.split('.')[0];
    emitRunning(ctx, 'dns', 10, 'Checking existing records...');
    const existing = await dns.findByHostname(subdomain);
    let recordId: string;
    if (existing) {
      emitRunning(ctx, 'dns', 20, `Found existing: ${svc.subdomain}`);
      recordId = existing.id;
    } else {
      emitRunning(ctx, 'dns', 15, 'Creating record...');
      const record = await dns.createRecord({ subdomain, ip: publicIp });
      recordId = record.id;
      emitRunning(ctx, 'dns', 25, `Created: ${svc.subdomain}`);
    }
    const propagation = await runPropagationWithinDns(ctx, fullDomain);
    if (!propagation.success) {
      emitStepError(ctx, 'dns', 'DNS not propagated after 2 minutes', 'DNS failed');
      return { recordId: null, propagationSuccess: false, globalVerified: false };
    }
    const detail = propagation.globalVerified
      ? `${fullDomain} propagated globally`
      : `${fullDomain} propagated locally`;
    emitSuccess(ctx, 'dns', detail);
    return { recordId, propagationSuccess: true, globalVerified: propagation.globalVerified };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DNS error';
    emitStepError(ctx, 'dns', msg, 'DNS failed');
    return { recordId: null, propagationSuccess: false, globalVerified: false };
  }
}

async function runPropagationWithinDns(
  ctx: ExposeContext,
  domain: string
): Promise<{ success: boolean; globalVerified: boolean }> {
  emitRunning(ctx, 'dns', 30, 'Checking local DNS...');
  const onProgress: PropagationCallback = p => {
    const base = p.phase === 'local' ? 30 : 70;
    const range = p.phase === 'local' ? 40 : 25;
    const pct = base + Math.round((p.attempt / p.maxAttempts) * range);
    const secs = Math.round(p.elapsed / 1000);
    const label = p.phase === 'local' ? 'Local' : 'Global';
    emitRunning(ctx, 'dns', pct, `${label} check ${p.attempt}/${p.maxAttempts} (${secs}s)`);
  };
  const result = await waitForDnsPropagation(domain, onProgress);
  return { success: result.success, globalVerified: result.globalVerified };
}

type ProxyExposeParams = {
  ctx: ExposeContext;
  svc: ProxyService;
  fullDomain: string;
  settings: SettingsService;
  lanIp: string;
};
export type ProxyExposeResult =
  | { id: string; sslPending?: boolean; sslError?: string }
  | null
  | undefined;
export async function handleProxyExpose(params: ProxyExposeParams): Promise<ProxyExposeResult> {
  const { ctx, svc, fullDomain, settings, lanIp } = params;
  if (svc.proxyHostId) {
    emitSkipped(ctx, 'proxy', 'Already configured');
    return { id: svc.proxyHostId };
  }
  emitRunning(ctx, 'proxy', 20, 'Connecting...');
  try {
    const proxy = await settings.getProxyProvider();
    if (!proxy) {
      emitSkipped(ctx, 'proxy', 'Skipped');
      return undefined;
    }
    emitRunning(ctx, 'proxy', 40, 'Checking existing hosts...');
    const existing = await proxy.findByDomain(fullDomain);
    if (existing) {
      await finishProxyStep(ctx, svc.port, fullDomain, true);
      return { id: existing.id };
    }
    emitRunning(ctx, 'proxy', 50, `Creating proxy host...`);
    emitRunning(ctx, 'proxy', 70, `Requesting SSL certificate...`);
    const host = await proxy.createHost({
      domain: fullDomain,
      targetHost: lanIp,
      targetPort: svc.port,
      targetScheme: (svc.scheme as 'http' | 'https') || 'http',
      ssl: true,
      skipDnsWait: true,
    });

    if (host.sslPending) {
      const detail = `HTTP only - SSL failed: ${host.sslError || 'unknown'}`;
      ctx.steps = updateStep(ctx.steps, 'proxy', { status: 'warning', progress: 100, detail });
      emit(ctx);
    } else {
      await finishProxyStep(ctx, svc.port, fullDomain, false);
    }
    return { id: host.id, sslPending: host.sslPending, sslError: host.sslError };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Proxy error';
    emitStepError(ctx, 'proxy', msg, 'Proxy failed');
    return null;
  }
}
export async function handleDnsUnexpose(
  ctx: ExposeContext,
  recordId: string | null,
  settings: SettingsService
): Promise<boolean> {
  if (!recordId) {
    emitSkipped(ctx, 'dns', 'No record');
    return true;
  }
  emitRunning(ctx, 'dns', 50, 'Removing...');
  try {
    const dns = await settings.getDnsProvider();
    if (dns) await dns.deleteRecord(recordId);
    emitSuccess(ctx, 'dns', 'Removed');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DNS error';
    emitStepError(ctx, 'dns', msg, 'DNS removal failed');
    return false;
  }
}

export async function handleProxyUnexpose(
  ctx: ExposeContext,
  hostId: string | null,
  settings: SettingsService
): Promise<boolean> {
  if (!hostId) {
    emitSkipped(ctx, 'proxy', 'No host');
    return true;
  }
  emitRunning(ctx, 'proxy', 50, 'Removing...');
  try {
    const proxy = await settings.getProxyProvider();
    if (proxy) await proxy.deleteHost(hostId);
    emitSuccess(ctx, 'proxy', 'Removed');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Proxy error';
    emitStepError(ctx, 'proxy', msg, 'Proxy removal failed');
    return false;
  }
}
