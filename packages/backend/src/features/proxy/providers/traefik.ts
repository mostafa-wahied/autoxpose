import { ProviderError } from '../../../core/errors/index.js';
import type {
  CreateProxyHostInput,
  ProxyHost,
  ProxyProvider,
  ProxyProviderConfig,
} from '../proxy.types.js';

export class TraefikProxyProvider implements ProxyProvider {
  readonly name = 'traefik';
  private baseUrl: string;

  constructor(config: ProxyProviderConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
  }

  async createHost(_input: CreateProxyHostInput): Promise<ProxyHost> {
    throw new ProviderError('traefik', 'Traefik uses labels for config, not API');
  }

  async deleteHost(_hostId: string): Promise<void> {
    throw new ProviderError('traefik', 'Traefik uses labels for config, not API');
  }

  async listHosts(): Promise<ProxyHost[]> {
    const response = await this.request<Record<string, unknown>[]>('/api/http/routers');
    return response.map(r => this.mapHost(r));
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new ProviderError('traefik', `API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private mapHost(raw: Record<string, unknown>): ProxyHost {
    const rule = String(raw.rule || '');
    const hostMatch = rule.match(/Host\(`([^`]+)`\)/);
    return {
      id: String(raw.name),
      domain: hostMatch ? hostMatch[1] : '',
      targetHost: String(raw.service || ''),
      targetPort: 0,
      ssl: Boolean(raw.tls),
      enabled: String(raw.status) === 'enabled',
    };
  }
}
