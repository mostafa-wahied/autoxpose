import type { FastifyPluginAsync } from 'fastify';
import { detectPlatform } from '../../core/platform.js';
import type { SettingsService } from './settings.service.js';
import { testDnsProvider, testProxyProvider } from './validation.js';

type ProviderBody = { provider: string; config: Record<string, string> };
type ParsedConfig = { provider: string; config: Record<string, string> } | null;

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

export function createSettingsRoutes(settings: SettingsService): FastifyPluginAsync {
  return async server => {
    registerDnsRoutes(server, settings);
    registerProxyRoutes(server, settings);
    registerStatusRoute(server, settings);
    registerTestRoutes(server, settings);
  };
}

function registerDnsRoutes(
  server: Parameters<FastifyPluginAsync>[0],
  settings: SettingsService
): void {
  server.get('/dns', async () => formatDnsConfig(await settings.getDnsConfig()));

  server.post<{ Body: ProviderBody }>('/dns', async request => {
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

  server.post<{ Body: ProviderBody }>('/proxy', async request => {
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
    const proxyConfigured = Boolean(proxyCfg);
    return {
      dns: formatDnsConfig(dnsCfg),
      proxy: formatProxyConfig(proxyCfg),
      platform: detectPlatform(),
      network: settings.getNetworkInfo(proxyConfigured),
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
