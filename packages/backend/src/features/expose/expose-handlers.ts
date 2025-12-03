import type { SettingsService } from '../settings/settings.service.js';
import { emit, emitError, type ExposeContext } from './progress-emitter.js';
import { updateStep } from './progress.types.js';

type DnsService = { domain: string; dnsRecordId: string | null };
type ProxyService = {
  domain: string;
  port: number;
  scheme: string | null;
  proxyHostId: string | null;
};

function emitSkipped(ctx: ExposeContext, step: 'dns' | 'proxy', detail: string): void {
  ctx.steps = updateStep(ctx.steps, step, { status: 'success', progress: 100, detail });
  emit(ctx);
}

function emitRunning(
  ctx: ExposeContext,
  step: 'dns' | 'proxy',
  progress: number,
  detail: string
): void {
  ctx.steps = updateStep(ctx.steps, step, { status: 'running', progress, detail });
  emit(ctx);
}

function emitSuccess(ctx: ExposeContext, step: 'dns' | 'proxy', detail: string): void {
  ctx.steps = updateStep(ctx.steps, step, { status: 'success', progress: 100, detail });
  emit(ctx);
}

function emitStepError(
  ctx: ExposeContext,
  step: 'dns' | 'proxy',
  msg: string,
  prefix: string
): void {
  ctx.steps = updateStep(ctx.steps, step, { status: 'error', progress: 100, detail: msg });
  emitError(ctx, `${prefix}: ${msg}`);
}

/**Handle DNS record creation during expose */
export async function handleDnsExpose(
  ctx: ExposeContext,
  svc: DnsService,
  settings: SettingsService,
  publicIp: string
): Promise<string | null | undefined> {
  if (svc.dnsRecordId) {
    emitSkipped(ctx, 'dns', 'Already configured');
    return svc.dnsRecordId;
  }

  emitRunning(ctx, 'dns', 20, 'Connecting...');

  try {
    const dns = await settings.getDnsProvider();
    if (!dns) {
      emitSkipped(ctx, 'dns', 'Skipped');
      return undefined;
    }

    emitRunning(ctx, 'dns', 50, 'Creating record...');
    const subdomain = svc.domain.split('.')[0];
    const record = await dns.createRecord({ subdomain, ip: publicIp });

    emitSuccess(ctx, 'dns', svc.domain);
    return record.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DNS error';
    emitStepError(ctx, 'dns', msg, 'DNS failed');
    return null;
  }
}

/**Handle proxy host creation during expose */
export async function handleProxyExpose(
  ctx: ExposeContext,
  svc: ProxyService,
  settings: SettingsService,
  lanIp: string
): Promise<string | null | undefined> {
  if (svc.proxyHostId) {
    emitSkipped(ctx, 'proxy', 'Already configured');
    return svc.proxyHostId;
  }

  emitRunning(ctx, 'proxy', 20, 'Connecting...');

  try {
    const proxy = await settings.getProxyProvider();
    if (!proxy) {
      emitSkipped(ctx, 'proxy', 'Skipped');
      return undefined;
    }

    emitRunning(ctx, 'proxy', 50, `Configuring ${svc.domain}...`);
    const host = await proxy.createHost({
      domain: svc.domain,
      targetHost: lanIp,
      targetPort: svc.port,
      targetScheme: (svc.scheme as 'http' | 'https') || 'http',
      ssl: true,
    });

    emitSuccess(ctx, 'proxy', `Port ${svc.port} → 443`);
    return host.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Proxy error';
    emitStepError(ctx, 'proxy', msg, 'Proxy failed');
    return null;
  }
}

/**Handle DNS record removal during unexpose */
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

/**Handle proxy host removal during unexpose */
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
