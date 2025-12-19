import { ProviderError } from '../../../core/errors/index.js';
import { createLogger } from '../../../core/logger/index.js';
import type {
  CreateProxyHostInput,
  ProxyHost,
  ProxyProvider,
  ProxyProviderConfig,
  UpdateProxyHostInput,
} from '../proxy.types.js';

const logger = createLogger('caddy-provider');

type CaddyRoute = {
  '@id'?: string;
  match?: Array<{ host?: string[] }>;
  handle?: Array<{ handler: string; upstreams?: Array<{ dial: string }> }>;
  terminal?: boolean;
};

type CaddyServer = {
  listen?: string[];
  routes?: CaddyRoute[];
};

type CaddyConfig = {
  apps?: {
    http?: {
      servers?: Record<string, CaddyServer>;
    };
  };
};

export class CaddyProxyProvider implements ProxyProvider {
  readonly name = 'caddy';
  private baseUrl: string;

  constructor(config: ProxyProviderConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
  }

  private buildRoute(domain: string, targetHost: string, targetPort: number): CaddyRoute {
    return {
      '@id': this.domainToId(domain),
      match: [{ host: [domain] }],
      handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: `${targetHost}:${targetPort}` }] }],
      terminal: true,
    };
  }

  private buildConfig(serverName: string, server: CaddyServer, routes: CaddyRoute[]): object {
    return {
      apps: {
        http: { servers: { [serverName]: { ...server, listen: [':80', ':443'], routes } } },
        tls: { automation: { policies: [{ issuers: [{ module: 'acme' }] }] } },
      },
    };
  }

  async createHost(input: CreateProxyHostInput): Promise<ProxyHost> {
    const route = this.buildRoute(input.domain, input.targetHost, input.targetPort);
    const serverName = await this.getServerName();
    const config = await this.request<CaddyConfig>('/config/');
    const existingServer = config?.apps?.http?.servers?.[serverName] || {};
    const newRoutes = [route, ...(existingServer.routes || [])];

    await this.request(`/load`, {
      method: 'POST',
      body: JSON.stringify(this.buildConfig(serverName, existingServer, newRoutes)),
      headers: { 'Content-Type': 'application/json' },
    });

    logger.info({ domain: input.domain, server: serverName }, 'Created Caddy route');

    return {
      id: this.domainToId(input.domain),
      domain: input.domain,
      targetHost: input.targetHost,
      targetPort: input.targetPort,
      ssl: true,
      enabled: true,
    };
  }

  async deleteHost(hostId: string): Promise<void> {
    await this.request(`/id/${hostId}`, { method: 'DELETE' });
    logger.info({ hostId }, 'Deleted Caddy route');
  }

  async updateHost(hostId: string, input: UpdateProxyHostInput): Promise<ProxyHost> {
    const existing = await this.findById(hostId);
    if (!existing) {
      throw new ProviderError('caddy', `Host not found: ${hostId}`);
    }

    const targetHost = input.targetHost ?? existing.targetHost;
    const targetPort = input.targetPort ?? existing.targetPort;

    const route = this.buildRoute(existing.domain, targetHost, targetPort);
    await this.request(`/id/${hostId}`, {
      method: 'PATCH',
      body: JSON.stringify(route),
    });

    return {
      ...existing,
      targetHost,
      targetPort,
    };
  }

  private async findById(hostId: string): Promise<ProxyHost | null> {
    const hosts = await this.listHosts();
    return hosts.find(h => h.id === hostId) ?? null;
  }

  async listHosts(): Promise<ProxyHost[]> {
    const config = await this.request<CaddyConfig>('/config/');
    return this.parseHosts(config);
  }

  async findByDomain(domain: string): Promise<ProxyHost | null> {
    const hosts = await this.listHosts();
    return hosts.find(h => h.domain === domain) ?? null;
  }

  async retrySsl(hostId: string, domain: string): Promise<{ success: boolean; error?: string }> {
    logger.info({ hostId, domain }, 'Caddy manages TLS automatically; retry not required');
    return { success: true };
  }

  private async getServerName(): Promise<string> {
    const config = await this.request<CaddyConfig>('/config/');
    const servers = config?.apps?.http?.servers || {};
    const serverNames = Object.keys(servers);
    if (serverNames.length === 0) {
      throw new ProviderError('caddy', 'No HTTP servers found in Caddy config');
    }
    return serverNames[0];
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
      const body = await response.text();
      const errorMsg = this.buildCaddyError(response.status, body);
      throw new ProviderError('caddy', errorMsg);
    }

    if (response.status === 200 && response.headers.get('content-length') === '0') {
      return null as T;
    }

    const text = await response.text();
    if (!text) return null as T;
    return JSON.parse(text) as T;
  }

  private buildCaddyError(status: number, body: string): string {
    if (status === 404) return 'Service not found. Check your Caddy admin API URL.';
    if (status === 401 || status === 403)
      return 'Access denied. Check Caddy admin API permissions.';
    if (status === 500) return 'Server error. Caddy may be misconfigured.';

    let errorMsg = `Connection failed (HTTP ${status}).`;
    if (body && !body.includes('<html>') && body.length < 100) {
      errorMsg = `${errorMsg} ${body}`;
    }
    return errorMsg;
  }

  private parseHosts(config: CaddyConfig): ProxyHost[] {
    const hosts: ProxyHost[] = [];
    const servers = config?.apps?.http?.servers || {};

    for (const server of Object.values(servers)) {
      for (const route of server.routes || []) {
        const domain = route.match?.[0]?.host?.[0];
        const upstream = route.handle?.[0]?.upstreams?.[0]?.dial;
        if (!domain || !upstream) continue;

        const [targetHost, portStr] = upstream.split(':');
        hosts.push({
          id: route['@id'] || domain,
          domain,
          targetHost,
          targetPort: parseInt(portStr, 10) || 80,
          ssl: true,
          enabled: true,
        });
      }
    }

    return hosts;
  }

  private domainToId(domain: string): string {
    return `autoxpose-${domain.replace(/\./g, '-')}`;
  }
}
