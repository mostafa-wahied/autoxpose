import { cleanErrorMessage } from '../../core/errors/index.js';
import { createLogger } from '../../core/logger/index.js';
import type { DnsProviderConfig } from '../dns/dns.types.js';
import { CloudflareDnsProvider } from '../dns/providers/cloudflare.js';
import { DigitalOceanDnsProvider } from '../dns/providers/digitalocean.js';
import { NetlifyDnsProvider } from '../dns/providers/netlify.js';
import { PorkbunDnsProvider } from '../dns/providers/porkbun.js';
import { AliyunDnsProvider } from '../dns/providers/aliyun.js';
import { DnspodDnsProvider } from '../dns/providers/dnspod.js';
import { CaddyProxyProvider } from '../proxy/providers/caddy.js';
import { NpmProxyProvider } from '../proxy/providers/npm.js';
import type { ProxyProviderConfig } from '../proxy/proxy.types.js';

const logger = createLogger('validation');
const DOMAIN_CHECK_TIMEOUT = 8000;

type TestResult = { ok: boolean; error?: string };

const REQUIRED_DNS_FIELDS: Record<string, string[]> = {
  cloudflare: ['token', 'zoneId', 'domain'],
  netlify: ['token', 'zoneId', 'domain'],
  digitalocean: ['token', 'domain'],
  porkbun: ['apiKey', 'secretKey', 'domain'],
  aliyun: ['accessKeyId', 'accessKeySecret', 'domain'],
  dnspod: ['secretId', 'secretKey', 'domain'],
};

export async function testDnsProvider(
  provider: string,
  config: Record<string, string>
): Promise<TestResult> {
  try {
    const missingFields = (REQUIRED_DNS_FIELDS[provider] || []).filter(
      field => !config[field]?.trim()
    );
    if (missingFields.length > 0) {
      return { ok: false, error: `Missing required settings: ${missingFields.join(', ')}` };
    }
    const dns = createDnsProvider(provider, config);
    if (!dns) return { ok: false, error: 'Unknown provider' };
    await dns.listRecords();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn({ provider, err }, 'DNS provider test failed');
    return { ok: false, error: cleanErrorMessage(message) };
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
    return { ok: false, error: cleanErrorMessage(message) };
  }
}

export async function checkDomainReachable(
  domain: string,
  sslPending?: boolean
): Promise<TestResult & { protocol?: 'https' | 'http' }> {
  if (!sslPending) {
    const httpsUrl = `https://${domain}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOMAIN_CHECK_TIMEOUT);

    try {
      const response = await fetch(httpsUrl, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok || response.status < 500) {
        return { ok: true, protocol: 'https' };
      }
    } catch {
      clearTimeout(timeout);
    }
  }

  const httpUrl = `http://${domain}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOMAIN_CHECK_TIMEOUT);

  try {
    const response = await fetch(httpUrl, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok || response.status < 500) {
      return { ok: true, protocol: 'http' };
    }
  } catch {
    clearTimeout(timeout);
  }

  return { ok: false, error: 'Domain not reachable' };
}

type DnsProviderType =
  | NetlifyDnsProvider
  | CloudflareDnsProvider
  | DigitalOceanDnsProvider
  | PorkbunDnsProvider
  | AliyunDnsProvider
  | DnspodDnsProvider
  | null;

function createDnsProvider(provider: string, config: Record<string, string>): DnsProviderType {
  const tokenConfig: DnsProviderConfig = {
    token: config.token,
    zoneId: config.zoneId,
    domain: config.domain,
  };
  if (provider === 'netlify') return new NetlifyDnsProvider(tokenConfig);
  if (provider === 'cloudflare') return new CloudflareDnsProvider(tokenConfig);
  if (provider === 'digitalocean') return new DigitalOceanDnsProvider(tokenConfig);
  if (provider === 'porkbun') {
    return new PorkbunDnsProvider({
      token: config.apiKey,
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      domain: config.domain,
    });
  }
  if (provider === 'aliyun') {
    return new AliyunDnsProvider({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      domain: config.domain,
    });
  }
  if (provider === 'dnspod') {
    return new DnspodDnsProvider({
      secretId: config.secretId,
      secretKey: config.secretKey,
      domain: config.domain,
    });
  }
  return null;
}

type ProxyProviderType = NpmProxyProvider | CaddyProxyProvider | null;

function createProxyProvider(provider: string, config: ProxyProviderConfig): ProxyProviderType {
  if (provider === 'npm') return new NpmProxyProvider(config);
  if (provider === 'caddy') return new CaddyProxyProvider(config);
  return null;
}
