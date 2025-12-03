import { ProviderError } from '../../../core/errors/index.js';
import type {
  CreateProxyHostInput,
  ProxyHost,
  ProxyProvider,
  ProxyProviderConfig,
} from '../proxy.types.js';

export class CaddyProxyProvider implements ProxyProvider {
  readonly name = 'caddy';
  private baseUrl: string;

  constructor(config: ProxyProviderConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
  }

  async createHost(input: CreateProxyHostInput): Promise<ProxyHost> {
    const config = {
      [`${input.domain}`]: {
        handle: [
          {
            handler: 'reverse_proxy',
            upstreams: [{ dial: `${input.targetHost}:${input.targetPort}` }],
          },
        ],
      },
    };

    await this.request('/config/apps/http/servers/srv0/routes', {
      method: 'POST',
      body: JSON.stringify(config),
    });

    return {
      id: input.domain,
      domain: input.domain,
      targetHost: input.targetHost,
      targetPort: input.targetPort,
      ssl: true,
      enabled: true,
    };
  }

  async deleteHost(hostId: string): Promise<void> {
    await this.request(`/id/${hostId}`, { method: 'DELETE' });
  }

  async listHosts(): Promise<ProxyHost[]> {
    const response = await this.request<Record<string, unknown>>('/config/apps/http/servers');
    return this.parseHosts(response);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new ProviderError('caddy', `API error: ${response.status}`);
    }

    if (response.status === 204) return null as T;
    return response.json() as Promise<T>;
  }

  private parseHosts(_servers: Record<string, unknown>): ProxyHost[] {
    const hosts: ProxyHost[] = [];
    return hosts;
  }
}
