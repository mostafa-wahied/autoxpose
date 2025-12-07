import type { DnsProvider } from '../dns/dns.types.js';
import { CloudflareDnsProvider } from '../dns/providers/cloudflare.js';
import { DigitalOceanDnsProvider } from '../dns/providers/digitalocean.js';
import { NetlifyDnsProvider } from '../dns/providers/netlify.js';
import { PorkbunDnsProvider } from '../dns/providers/porkbun.js';
import { CaddyProxyProvider } from '../proxy/providers/caddy.js';
import { NpmProxyProvider } from '../proxy/providers/npm.js';
import type { ProxyProvider } from '../proxy/proxy.types.js';
import type { ProviderConfigRecord, SettingsRepository } from './settings.repository.js';

type ParsedConfig = { provider: string; config: Record<string, string> } | null;

export class SettingsService {
  constructor(private repository: SettingsRepository) {}

  async getDnsConfig(): Promise<ParsedConfig> {
    const record = await this.repository.getByType('dns');
    return record ? this.parseConfig(record) : null;
  }

  async getProxyConfig(): Promise<ParsedConfig> {
    const record = await this.repository.getByType('proxy');
    return record ? this.parseConfig(record) : null;
  }

  async saveDnsConfig(provider: string, config: Record<string, string>): Promise<void> {
    const existing = await this.getDnsConfig();
    const newConfig = { ...config };

    if (existing) {
      if (!newConfig.token || newConfig.token.includes('••••')) {
        newConfig.token = existing.config.token;
      }
      if (!newConfig.apiKey || newConfig.apiKey.includes('••••')) {
        newConfig.apiKey = existing.config.apiKey;
      }
      if (!newConfig.secretKey || newConfig.secretKey.includes('••••')) {
        newConfig.secretKey = existing.config.secretKey;
      }
    }

    await this.repository.save({ type: 'dns', provider, config: newConfig });
  }

  async saveProxyConfig(provider: string, config: Record<string, string>): Promise<void> {
    const existing = await this.getProxyConfig();
    const newConfig = { ...config };

    if (existing && (!newConfig.password || newConfig.password.includes('••••'))) {
      newConfig.password = existing.config.password;
    }

    await this.repository.save({ type: 'proxy', provider, config: newConfig });
  }

  async getDnsProvider(): Promise<DnsProvider | null> {
    const cfg = await this.getDnsConfig();
    if (!cfg) return null;
    return this.createDnsProvider(cfg.provider, cfg.config);
  }

  async getProxyProvider(): Promise<ProxyProvider | null> {
    const cfg = await this.getProxyConfig();
    if (!cfg) return null;
    return this.createProxyProvider(cfg.provider, cfg.config);
  }

  private createDnsProvider(provider: string, cfg: Record<string, string>): DnsProvider | null {
    if (provider === 'cloudflare') {
      return new CloudflareDnsProvider({ token: cfg.token, zoneId: cfg.zoneId });
    }
    if (provider === 'netlify') {
      return new NetlifyDnsProvider({ token: cfg.token, zoneId: cfg.zoneId });
    }
    if (provider === 'digitalocean') {
      return new DigitalOceanDnsProvider({ token: cfg.token, domain: cfg.domain });
    }
    if (provider === 'porkbun') {
      return new PorkbunDnsProvider({
        token: cfg.apiKey,
        apiKey: cfg.apiKey,
        secretKey: cfg.secretKey,
        domain: cfg.domain,
      });
    }
    return null;
  }

  private createProxyProvider(provider: string, cfg: Record<string, string>): ProxyProvider | null {
    if (provider === 'npm') {
      return new NpmProxyProvider({ url: cfg.url, username: cfg.username, password: cfg.password });
    }
    if (provider === 'caddy') {
      return new CaddyProxyProvider({ url: cfg.url });
    }
    return null;
  }

  private parseConfig(record: ProviderConfigRecord): ParsedConfig {
    return { provider: record.provider, config: JSON.parse(record.config) };
  }
}
