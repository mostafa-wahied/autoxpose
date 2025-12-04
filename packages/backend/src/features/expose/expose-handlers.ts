import type { SettingsService } from '../settings/settings.service.js';
import { emit, emitError, type ExposeContext } from './progress-emitter.js';
import { updateStep } from './progress.types.js';

type DnsService = { subdomain: string; dnsRecordId: string | null };
type ProxyService = {
  subdomain: string;
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

    const subdomain = svc.subdomain.split('.')[0];
    emitRunning(ctx, 'dns', 40, 'Checking existing records...');
    const existing = await dns.findByHostname(subdomain);

    if (existing) {
      emitSuccess(ctx, 'dns', `Found existing: ${svc.subdomain}`);
      return existing.id;
    }

    emitRunning(ctx, 'dns', 60, 'Creating record...');
    const record = await dns.createRecord({ subdomain, ip: publicIp });

    emitSuccess(ctx, 'dns', svc.subdomain);
    return record.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DNS error';
    emitStepError(ctx, 'dns', msg, 'DNS failed');
    return null;
  }
}

type ProxyExposeParams = {
  ctx: ExposeContext;
  svc: ProxyService;
  fullDomain: string;
  settings: SettingsService;
  lanIp: string;
};

/**Handle proxy host creation during expose */
export async function handleProxyExpose(
  params: ProxyExposeParams
): Promise<string | null | undefined> {
  const { ctx, svc, fullDomain, settings, lanIp } = params;

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

    emitRunning(ctx, 'proxy', 40, 'Checking existing hosts...');
    const existing = await proxy.findByDomain(fullDomain);

    if (existing) {
      emitSuccess(ctx, 'proxy', `Found existing: Port ${svc.port} → 443`);
      return existing.id;
    }

    emitRunning(ctx, 'proxy', 60, `Configuring ${fullDomain}...`);
    const host = await proxy.createHost({
      domain: fullDomain,
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
