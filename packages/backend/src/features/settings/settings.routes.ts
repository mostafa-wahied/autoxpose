import type { FastifyPluginAsync } from 'fastify';
import type { SettingsService } from './settings.service.js';

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
  config: { token: string; zoneId: string } | null;
};
type ProxyConfigResponse = {
  configured: boolean;
  provider: string | null;
  config: { url: string; username: string; password: string } | null;
};

function formatDnsConfig(cfg: ParsedConfig): DnsConfigResponse {
  if (!cfg) return { configured: false, provider: null, config: null };
  return {
    configured: true,
    provider: cfg.provider,
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
      return { success: true };
    });

    server.get('/proxy', async () => formatProxyConfig(await settings.getProxyConfig()));

    server.post<{ Body: ProviderBody }>('/proxy', async request => {
      await settings.saveProxyConfig(request.body.provider, request.body.config);
      return { success: true };
    });

    server.get('/status', async () => ({
      dns: formatDnsConfig(await settings.getDnsConfig()),
      proxy: formatProxyConfig(await settings.getProxyConfig()),
    }));
  };
}
