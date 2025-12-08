import dns from 'node:dns/promises';
import https from 'node:https';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('dns-propagation');

type PropagationProgress = {
  attempt: number;
  maxAttempts: number;
  phase: 'local' | 'global';
  elapsed: number;
};

export type PropagationCallback = (progress: PropagationProgress) => void;

export type WaitResult = {
  success: boolean;
  localResolved: boolean;
  globalVerified: boolean;
  totalTime: number;
};

async function checkLocalDns(domain: string): Promise<boolean> {
  try {
    await dns.lookup(domain);
    return true;
  } catch {
    return false;
  }
}

async function checkGlobalDns(domain: string): Promise<boolean> {
  return new Promise(resolve => {
    const req = https.request(
      {
        hostname: 'dns.google',
        path: `/resolve?name=${encodeURIComponent(domain)}&type=A`,
        method: 'GET',
        timeout: 4000,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8');
            const data = JSON.parse(body);
            const answers = Array.isArray(data.Answer) ? data.Answer : [];
            const hasA = answers.some((a: { type?: number }) => a.type === 1);
            resolve(hasA);
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForLocalResolution(
  domain: string,
  startTime: number,
  onProgress?: PropagationCallback
): Promise<boolean> {
  const maxAttempts = 12;
  const interval = 10000;

  for (let i = 1; i <= maxAttempts; i++) {
    onProgress?.({ attempt: i, maxAttempts, phase: 'local', elapsed: Date.now() - startTime });
    if (await checkLocalDns(domain)) {
      logger.info({ domain, attempt: i }, 'DNS resolves locally');
      return true;
    }
    if (i < maxAttempts) await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

async function waitForGlobalPropagation(
  domain: string,
  startTime: number,
  onProgress?: PropagationCallback
): Promise<boolean> {
  const bufferMs = 30000;
  const interval = 5000;
  const checks = Math.ceil(bufferMs / interval);

  for (let i = 1; i <= checks; i++) {
    onProgress?.({
      attempt: i,
      maxAttempts: checks,
      phase: 'global',
      elapsed: Date.now() - startTime,
    });
    if (await checkGlobalDns(domain)) {
      logger.info({ domain }, 'Global DNS verified');
      return true;
    }
    if (i < checks) await new Promise(r => setTimeout(r, interval));
  }
  logger.info({ domain }, 'Global buffer complete');
  return false;
}

export async function waitForDnsPropagation(
  domain: string,
  onProgress?: PropagationCallback
): Promise<WaitResult> {
  const startTime = Date.now();
  const localResolved = await waitForLocalResolution(domain, startTime, onProgress);

  if (!localResolved) {
    return {
      success: false,
      localResolved: false,
      globalVerified: false,
      totalTime: Date.now() - startTime,
    };
  }

  const globalVerified = await waitForGlobalPropagation(domain, startTime, onProgress);
  return { success: true, localResolved: true, globalVerified, totalTime: Date.now() - startTime };
}
