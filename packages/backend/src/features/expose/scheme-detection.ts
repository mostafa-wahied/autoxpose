import { createLogger } from '../../core/logger/index.js';
import https from 'node:https';
import http from 'node:http';

const logger = createLogger('scheme-detection');

const HTTPS_PORTS = [443, 8443, 9443, 10443];

export async function testBackendScheme(
  host: string,
  port: number,
  currentScheme?: string,
  timeoutMs = 2000
): Promise<'http' | 'https' | null> {
  const portSuggestsHttps = HTTPS_PORTS.includes(port);
  const shouldTestHttpsFirst = currentScheme === 'https' || portSuggestsHttps;

  if (shouldTestHttpsFirst) {
    const httpsResult = await testScheme('https', host, port, timeoutMs);
    if (httpsResult) {
      logger.info({ host, port, scheme: 'https' }, 'Backend confirmed as HTTPS');
      return 'https';
    }

    const httpResult = await testScheme('http', host, port, timeoutMs);
    if (httpResult) {
      logger.info(
        { host, port, scheme: 'http', note: 'HTTPS failed, using HTTP' },
        'Backend using HTTP despite HTTPS port/hint'
      );
      return 'http';
    }
  } else {
    const [httpResult, httpsResult] = await Promise.all([
      testScheme('http', host, port, timeoutMs),
      testScheme('https', host, port, timeoutMs),
    ]);

    if (httpsResult) {
      logger.info(
        { host, port, scheme: 'https', httpAlsoWorks: httpResult },
        'Backend supports HTTPS (preferred)'
      );
      return 'https';
    }

    if (httpResult) {
      logger.info({ host, port, scheme: 'http' }, 'Backend using HTTP');
      return 'http';
    }
  }

  logger.warn({ host, port }, 'Backend not responding to HTTP or HTTPS');
  return null;
}

async function testScheme(
  scheme: 'http' | 'https',
  host: string,
  port: number,
  timeoutMs: number
): Promise<boolean> {
  return new Promise(resolve => {
    const module = scheme === 'https' ? https : http;
    const options = {
      host,
      port,
      method: 'HEAD',
      timeout: timeoutMs,
      rejectUnauthorized: false,
    };

    const req = module.request(options, res => {
      const success = res.statusCode !== undefined && res.statusCode < 500;
      if (success) {
        logger.info(
          { url: `${scheme}://${host}:${port}`, status: res.statusCode },
          'Backend health check passed'
        );
      }
      resolve(success);
    });

    req.on('error', err => {
      logger.debug({ url: `${scheme}://${host}:${port}`, err }, 'Backend health check failed');
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}
