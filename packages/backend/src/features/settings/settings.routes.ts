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
  config: { token: string; zoneId: string } | null;
};
type ProxyConfigResponse = {
  configured: boolean;
  provider: string | null;
  config: { url: string; username: string; password: string } | null;
};

function formatDnsConfig(cfg: ParsedConfig): DnsConfigResponse {
  if (!cfg) return { configured: false, provider: null, domain: null, config: null };
  return {
    configured: true,
    provider: cfg.provider,
    domain: cfg.config.domain ?? null,
    config: { token: maskSecret(cfg.config.token), zoneId: cfg.config.zoneId ?? '' },
  };
}

function formatProxyConfig(cfg: ParsedConfig): ProxyConfigResponse {
  if (!cfg) return { configured: false, provider: null, config: null };
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

export function createSettingsRoutes(settings: SettingsService): FastifyPluginAsync {
  return async server => {
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

    server.get('/status', async () => ({
      dns: formatDnsConfig(await settings.getDnsConfig()),
      proxy: formatProxyConfig(await settings.getProxyConfig()),
      platform: detectPlatform(),
    }));

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
  };
}
