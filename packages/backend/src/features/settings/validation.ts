import { createLogger } from '../../core/logger/index.js';
import type { DnsProviderConfig } from '../dns/dns.types.js';
import { CloudflareDnsProvider } from '../dns/providers/cloudflare.js';
import { NetlifyDnsProvider } from '../dns/providers/netlify.js';
import { NpmProxyProvider } from '../proxy/providers/npm.js';
import type { ProxyProviderConfig } from '../proxy/proxy.types.js';

const logger = createLogger('validation');
const DOMAIN_CHECK_TIMEOUT = 5000;

type TestResult = { ok: boolean; error?: string };

export async function testDnsProvider(
  provider: string,
  config: DnsProviderConfig
): Promise<TestResult> {
  try {
    const dns = createDnsProvider(provider, config);
    if (!dns) return { ok: false, error: 'Unknown provider' };
    await dns.listRecords();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn({ provider, err }, 'DNS provider test failed');
    return { ok: false, error: message };
  }
}

export async function testProxyProvider(
  provider: string,
  config: ProxyProviderConfig
): Promise<TestResult> {
  try {
    const proxy = createProxyProvider(provider, config);
    if (!proxy) return { ok: false, error: 'Unknown provider' };
    await proxy.listHosts();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn({ provider, err }, 'Proxy provider test failed');
    return { ok: false, error: message };
  }
}

export async function checkDomainReachable(domain: string): Promise<TestResult> {
  const url = `https://${domain}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOMAIN_CHECK_TIMEOUT);

  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    return { ok: response.ok || response.status < 500 };
  } catch {
    clearTimeout(timeout);
    return { ok: false, error: 'Domain not reachable' };
  }
}

function createDnsProvider(
  provider: string,
  config: DnsProviderConfig
): ReturnType<typeof createDns> {
  return createDns(provider, config);
}

function createDns(
  provider: string,
  config: DnsProviderConfig
): NetlifyDnsProvider | CloudflareDnsProvider | null {
  if (provider === 'netlify') return new NetlifyDnsProvider(config);
  if (provider === 'cloudflare') return new CloudflareDnsProvider(config);
  return null;
}

function createProxyProvider(
  provider: string,
  config: ProxyProviderConfig
): NpmProxyProvider | null {
  if (provider === 'npm') return new NpmProxyProvider(config);
  return null;
}
