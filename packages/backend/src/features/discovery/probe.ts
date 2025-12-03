import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('probe');

export type ProbeResult = {
  scheme: 'http' | 'https';
  port: number;
  responsive: boolean;
};

export async function probeBackend(
  host: string,
  port: number,
  timeoutMs: number = 3000
): Promise<ProbeResult> {
  const httpsResult = await tryConnect(host, port, 'https', timeoutMs);
  if (httpsResult.responsive) {
    logger.debug({ host, port, scheme: 'https' }, 'Backend responds to HTTPS');
    return httpsResult;
  }

  const httpResult = await tryConnect(host, port, 'http', timeoutMs);
  if (httpResult.responsive) {
    logger.debug({ host, port, scheme: 'http' }, 'Backend responds to HTTP');
    return httpResult;
  }

  logger.debug({ host, port }, 'Backend not responsive, defaulting to http');
  return { scheme: 'http', port, responsive: false };
}

async function tryConnect(
  host: string,
  port: number,
  scheme: 'http' | 'https',
  timeoutMs: number
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${scheme}://${host}:${port}/`;
    await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    return { scheme, port, responsive: true };
  } catch (error) {
    const err = error as Error;

    if (err.message?.includes('ECONNRESET') && scheme === 'http') {
      return { scheme, port, responsive: false };
    }

    if (
      err.message?.includes('wrong version number') ||
      err.message?.includes('EPROTO') ||
      err.message?.includes('SSL') ||
      err.message?.includes('plain HTTP')
    ) {
      return { scheme, port, responsive: false };
    }

    return { scheme, port, responsive: false };
  } finally {
    clearTimeout(timeout);
  }
}

export function selectBestPort(ports: Array<{ publicPort: number; privatePort: number }>): {
  port: number;
  likelyHttps: boolean;
} {
  const httpsPrivatePorts = [443, 8443, 9443];

  for (const p of ports) {
    if (httpsPrivatePorts.includes(p.privatePort)) {
      return { port: p.publicPort, likelyHttps: true };
    }
  }

  const firstPublic = ports.find(p => p.publicPort);
  if (firstPublic) {
    return { port: firstPublic.publicPort, likelyHttps: false };
  }

  return { port: ports[0]?.publicPort || ports[0]?.privatePort || 80, likelyHttps: false };
}
