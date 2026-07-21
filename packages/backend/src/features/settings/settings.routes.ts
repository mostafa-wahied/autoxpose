import type { FastifyPluginAsync } from 'fastify';
import { detectPlatform } from '../../core/platform.js';
import type { ServicesRepository } from '../services/services.repository.js';
import type { SettingsService } from './settings.service.js';
import { testDnsProvider, testProxyProvider } from './validation.js';
import { NpmProxyProvider } from '../proxy/providers/npm.js';

type ProviderBody = { provider: string; config: Record<string, string> };
type ParsedConfig = { provider: string; config: Record<string, string> } | null;

function hasProviderConfig(body: unknown): body is ProviderBody {
  if (!body || typeof body !== 'object') return false;
  const value = body as { provider?: unknown; config?: unknown };
  return typeof value.provider === 'string' && !!value.config && typeof value.config === 'object';
}

function maskSecret(value: string | undefined): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return value.slice(0, 4) + '••••' + value.slice(-4);
}

type DnsConfigResponse = {
  configured: boolean;
  provider: string | null;
  domain: string | null;
  config: Record<string, string> | null;
};
type ProxyConfigResponse = {
  configured: boolean;
  provider: string | null;
  config: Record<string, string> | null;
};

function formatDnsConfig(cfg: ParsedConfig): DnsConfigResponse {
  if (!cfg) return { configured: false, provider: null, domain: null, config: null };

  const baseConfig: Record<string, string> = {};

  if (cfg.provider === 'cloudflare' || cfg.provider === 'netlify') {
    baseConfig.token = maskSecret(cfg.config.token);
    baseConfig.zoneId = cfg.config.zoneId ?? '';
  } else if (cfg.provider === 'digitalocean') {
    baseConfig.token = maskSecret(cfg.config.token);
  } else if (cfg.provider === 'porkbun') {
    baseConfig.apiKey = maskSecret(cfg.config.apiKey);
    baseConfig.secretKey = maskSecret(cfg.config.secretKey);
  } else if (cfg.provider === 'aliyun') {
    baseConfig.accessKeyId = maskSecret(cfg.config.accessKeyId);
    baseConfig.accessKeySecret = maskSecret(cfg.config.accessKeySecret);
  } else if (cfg.provider === 'dnspod') {
    baseConfig.secretId = maskSecret(cfg.config.secretId);
    baseConfig.secretKey = maskSecret(cfg.config.secretKey);
  }

  return {
    configured: true,
    provider: cfg.provider,
    domain: cfg.config.domain ?? null,
    config: baseConfig,
  };
}

function formatProxyConfig(cfg: ParsedConfig): ProxyConfigResponse {
  if (!cfg) return { configured: false, provider: null, config: null };

  if (cfg.provider === 'npm') {
    return {
      configured: true,
      provider: cfg.provider,
      config: {
        url: cfg.config.url ?? '',
        username: cfg.config.username ?? '',
        password: maskSecret(cfg.config.password),
      },
    };
  }

  if (cfg.provider === 'caddy') {
    return {
      configured: true,
      provider: cfg.provider,
      config: { url: cfg.config.url ?? '' },
    };
  }

  return { configured: true, provider: cfg.provider, config: cfg.config };
}

export function createSettingsRoutes(
  settings: SettingsService,
  servicesRepo: ServicesRepository
): FastifyPluginAsync {
  return async server => {
    registerDnsRoutes(server, settings);
    registerProxyRoutes(server, settings);
    registerWildcardRoutes(server, settings);
    registerStatusRoute(server, settings);
    registerTestRoutes(server, settings);
    registerResetRoutes(server, settings, servicesRepo);
    registerExportImportRoutes(server, settings);
  };
}

function registerResetRoutes(
  server: Parameters<FastifyPluginAsync>[0],
  settings: SettingsService,
  servicesRepo: ServicesRepository
): void {
  server.post('/reset', async () => {
    const clearedSettings = await settings.clearAllConfig();
    const clearedServices = await servicesRepo.deleteAll();
    return { success: true, clearedSettings, clearedServices };
  });
}

function registerDnsRoutes(
  server: Parameters<FastifyPluginAsync>[0],
  settings: SettingsService
): void {
  server.get('/dns', async () => formatDnsConfig(await settings.getDnsConfig()));

  server.post<{ Body: ProviderBody }>('/dns', async (request, reply) => {
    if (!hasProviderConfig(request.body)) {
      reply.code(400);
      return { success: false, error: 'Invalid DNS config payload' };
    }
    await settings.saveDnsConfig(request.body.provider, request.body.config);
    const cfg = await settings.getDnsConfig();
    if (!cfg) return { success: true, validation: { ok: false, error: 'Failed to load config' } };
    const validation = await testDnsProvider(
      cfg.provider,
      cfg.config as Parameters<typeof testDnsProvider>[1]
    );
    return { success: true, validation };
  });
}

function registerProxyRoutes(
  server: Parameters<FastifyPluginAsync>[0],
  settings: SettingsService
): void {
  server.get('/proxy', async () => formatProxyConfig(await settings.getProxyConfig()));

  server.post<{ Body: ProviderBody }>('/proxy', async (request, reply) => {
    if (!hasProviderConfig(request.body)) {
      reply.code(400);
      return { success: false, error: 'Invalid proxy config payload' };
    }
    const config = { ...request.body.config };
    if (config.url && !config.url.startsWith('http')) {
      config.url = `http://${config.url}`;
    }
    await settings.saveProxyConfig(request.body.provider, config);
    const cfg = await settings.getProxyConfig();
    if (!cfg) return { success: true, validation: { ok: false, error: 'Failed to load config' } };
    const validation = await testProxyProvider(
      cfg.provider,
      cfg.config as Parameters<typeof testProxyProvider>[1]
    );
    return { success: true, validation };
  });
}

function registerStatusRoute(
  server: Parameters<FastifyPluginAsync>[0],
  settings: SettingsService
): void {
  server.get('/status', async () => {
    const dnsCfg = await settings.getDnsConfig();
    const proxyCfg = await settings.getProxyConfig();
    const wildcardCfg = await settings.getWildcardConfig();
    const proxyConfigured = Boolean(proxyCfg);
    return {
      dns: formatDnsConfig(dnsCfg),
      proxy: formatProxyConfig(proxyCfg),
      platform: detectPlatform(),
      network: await settings.getNetworkInfo(proxyConfigured),
      wildcard: {
        enabled: wildcardCfg?.enabled ?? false,
        domain: wildcardCfg?.domain ?? null,
        certId: wildcardCfg?.certId ?? null,
        detected: wildcardCfg?.certId !== null && wildcardCfg?.certId !== undefined,
      },
    };
  });
}

function registerWildcardRoutes(
  server: Parameters<FastifyPluginAsync>[0],
  settings: SettingsService
): void {
  server.get('/wildcard', async () => {
    const config = await settings.getWildcardConfig();
    return {
      enabled: config?.enabled ?? false,
      domain: config?.domain ?? null,
      certId: config?.certId ?? null,
      detectedAt: config?.detectedAt ?? null,
    };
  });

  server.post<{ Body: { enabled: boolean; domain: string } }>('/wildcard', async request => {
    const { enabled, domain } = request.body;
    let certId: number | null = null;

    if (enabled) {
      const proxyCfg = await settings.getProxyConfig();
      if (proxyCfg?.provider === 'npm') {
        const npm = new NpmProxyProvider({
          url: proxyCfg.config.url,
          username: proxyCfg.config.username,
          password: proxyCfg.config.password,
        });
        const cert = await npm.findWildcardCertificate(domain);
        certId = cert?.id ?? null;
      }
    }

    const config = await settings.saveWildcardConfig({ enabled, domain, certId });
    return { success: true, config };
  });

  server.get('/wildcard/detect', async () => {
    const proxyCfg = await settings.getProxyConfig();
    if (!proxyCfg || proxyCfg.provider !== 'npm') {
      return { detected: false, domain: null, certId: null, fullDomain: null };
    }

    const npm = new NpmProxyProvider({
      url: proxyCfg.config.url,
      username: proxyCfg.config.username,
      password: proxyCfg.config.password,
    });

    const preferredDomain = await settings.getBaseDomainFromAnySource();
    if (preferredDomain) {
      const exactMatch = await npm.findWildcardCertificate(preferredDomain);
      if (exactMatch) {
        return {
          detected: true,
          domain: preferredDomain,
          certId: exactMatch.id,
          fullDomain: exactMatch.domain,
        };
      }
    }

    await npm['authenticate']();
    type Cert = { id: number; domain_names: string[] };
    const certs = await npm['request']<Cert[]>('/nginx/certificates');
    const wildcardCert = certs.find(c => c.domain_names.some(d => d.startsWith('*.')));

    if (!wildcardCert) {
      return { detected: false, domain: null, certId: null, fullDomain: null };
    }

    const wildcardDomain = wildcardCert.domain_names.find(d => d.startsWith('*.'));
    const baseDomain = wildcardDomain?.slice(2) ?? null;

    return {
      detected: true,
      domain: baseDomain,
      certId: wildcardCert.id,
      fullDomain: wildcardDomain,
    };
  });
}

function registerTestRoutes(
  server: Parameters<FastifyPluginAsync>[0],
  settings: SettingsService
): void {
  server.post('/dns/test', async () => {
    const cfg = await settings.getDnsConfig();
    if (!cfg) return { ok: false, error: 'DNS not configured' };
    return testDnsProvider(cfg.provider, cfg.config as Parameters<typeof testDnsProvider>[1]);
  });

  server.post('/proxy/test', async () => {
    const cfg = await settings.getProxyConfig();
    if (!cfg) return { ok: false, error: 'Proxy not configured' };
    return testProxyProvider(cfg.provider, cfg.config as Parameters<typeof testProxyProvider>[1]);
  });
}

function registerExportImportRoutes(
  server: Parameters<FastifyPluginAsync>[0],
  settings: SettingsService
): void {
  server.get('/export', async () => {
    const dnsCfg = await settings.getDnsConfig();
    const proxyCfg = await settings.getProxyConfig();
    return {
      dns: dnsCfg || null,
      proxy: proxyCfg || null,
    };
  });

  server.post<{ Body: { dns: ParsedConfig; proxy: ParsedConfig } }>('/import', async request => {
    const { dns, proxy } = request.body;
    if (dns?.provider && dns.config) {
      await settings.saveDnsConfig(dns.provider, dns.config);
    }
    if (proxy?.provider && proxy.config) {
      await settings.saveProxyConfig(proxy.provider, proxy.config);
    }
    return { success: true };
  });
}
