import dns from 'node:dns/promises';
import { ProviderError } from '../../../core/errors/index.js';
import { createLogger } from '../../../core/logger/index.js';
import type {
  CreateProxyHostInput,
  ProxyHost,
  ProxyProvider,
  ProxyProviderConfig,
} from '../proxy.types.js';

const logger = createLogger('npm-provider');

export class NpmProxyProvider implements ProxyProvider {
  readonly name = 'npm';
  private baseUrl: string;
  private token: string | null = null;
  private username: string;
  private password: string;

  constructor(config: ProxyProviderConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.username = config.username || '';
    this.password = config.password || '';
  }

  async createHost(input: CreateProxyHostInput): Promise<ProxyHost> {
    await this.authenticate();
    const body = this.buildHostBody(input);
    const response = await this.request<Record<string, unknown>>('/nginx/proxy-hosts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const host = this.mapHost(response);
    if (input.ssl) {
      const sslResult = await this.trySslSetup(host.id, input.domain, input.skipDnsWait);
      host.sslPending = !sslResult.success;
      host.sslError = sslResult.error;
      host.ssl = sslResult.success;
    }
    return host;
  }

  private buildHostBody(input: CreateProxyHostInput): Record<string, unknown> {
    return {
      domain_names: [input.domain],
      forward_host: input.targetHost,
      forward_port: input.targetPort,
      forward_scheme: input.targetScheme || 'http',
      allow_websocket_upgrade: true,
      block_exploits: true,
      access_list_id: 0,
      certificate_id: 0,
      ssl_forced: false,
      http2_support: false,
      meta: { letsencrypt_agree: false, dns_challenge: false },
    };
  }

  private async trySslSetup(
    hostId: string,
    domain: string,
    skipDnsWait?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!skipDnsWait) {
        const isDnsReady = await this.waitForDns(domain);
        if (!isDnsReady) {
          const err = 'DNS not propagated after 2 minutes';
          logger.warn({ domain }, err);
          return { success: false, error: err };
        }
        logger.info({ domain }, 'Waiting for global DNS propagation (30s)...');
        await new Promise(r => setTimeout(r, 30000));
      }
      const certId = await this.findOrCreateCertificate(domain);
      await this.assignCertificateToHost(hostId, certId);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SSL setup failed';
      logger.warn({ err, domain }, 'Failed to setup SSL');
      return { success: false, error: msg };
    }
  }

  private async waitForDns(domain: string, maxAttempts = 12): Promise<boolean> {
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        logger.info({ domain, attempt: i, maxAttempts }, 'Checking DNS...');
        await dns.lookup(domain);
        logger.info({ domain }, 'DNS resolves locally');
        return true;
      } catch {
        if (i < maxAttempts) await new Promise(r => setTimeout(r, 10000));
      }
    }
    return false;
  }

  private async findOrCreateCertificate(domain: string): Promise<number> {
    const existing = await this.findCertificateByDomain(domain);
    if (existing) return existing;

    logger.info({ domain }, "Creating Let's Encrypt certificate");
    const resp = await this.request<{ id: number }>('/nginx/certificates', {
      method: 'POST',
      body: JSON.stringify({
        domain_names: [domain],
        meta: { dns_challenge: false },
        provider: 'letsencrypt',
      }),
    });
    return resp.id;
  }

  private async findCertificateByDomain(domain: string): Promise<number | null> {
    type Cert = { id: number; domain_names: string[] };
    const certs = await this.request<Cert[]>('/nginx/certificates');
    return certs.find(c => c.domain_names.includes(domain))?.id ?? null;
  }

  private async assignCertificateToHost(hostId: string, certId: number): Promise<void> {
    const existing = await this.request<Record<string, unknown>>(`/nginx/proxy-hosts/${hostId}`);

    const updateBody = {
      domain_names: existing.domain_names,
      forward_host: existing.forward_host,
      forward_port: existing.forward_port,
      forward_scheme: existing.forward_scheme || 'http',
      allow_websocket_upgrade: existing.allow_websocket_upgrade ?? true,
      block_exploits: existing.block_exploits ?? true,
      access_list_id: existing.access_list_id || 0,
      certificate_id: certId,
      ssl_forced: true,
      http2_support: true,
      hsts_enabled: true,
      hsts_subdomains: false,
      meta: existing.meta || {},
      advanced_config: existing.advanced_config || '',
      locations: existing.locations || [],
      caching_enabled: existing.caching_enabled ?? false,
    };

    await this.request(`/nginx/proxy-hosts/${hostId}`, {
      method: 'PUT',
      body: JSON.stringify(updateBody),
    });

    logger.info({ hostId, certId }, 'Proxy host updated with SSL');
  }

  async deleteHost(hostId: string): Promise<void> {
    await this.authenticate();
    await this.request(`/nginx/proxy-hosts/${hostId}`, { method: 'DELETE' });
  }

  async listHosts(): Promise<ProxyHost[]> {
    await this.authenticate();
    const response = await this.request<Record<string, unknown>[]>('/nginx/proxy-hosts');
    return response.map(r => this.mapHost(r));
  }

  async findByDomain(domain: string): Promise<ProxyHost | null> {
    const hosts = await this.listHosts();
    return hosts.find(h => h.domain === domain) ?? null;
  }

  async retrySsl(hostId: string, domain: string): Promise<{ success: boolean; error?: string }> {
    await this.authenticate();
    return this.trySslSetup(hostId, domain, true);
  }

  private async authenticate(): Promise<void> {
    if (this.token) return;

    const response = await this.request<{ token: string }>('/tokens', {
      method: 'POST',
      body: JSON.stringify({ identity: this.username, secret: this.password }),
      skipAuth: true,
    });

    this.token = response.token;
  }

  private buildErrorMessage(status: number, body: string): string {
    if (status === 404) return 'Service not found. Check your URL and port number.';
    if (status === 401) return 'Authentication failed. Check your username and password.';
    if (status === 403) return 'Access denied. Check your account permissions.';

    let errorMsg = `Connection failed (HTTP ${status}).`;

    if (body && !body.includes('<html>')) {
      errorMsg =
        body.length > 100 ? `${errorMsg} ${body.substring(0, 100)}...` : `${errorMsg} ${body}`;
    }

    return errorMsg;
  }

  private async request<T>(
    path: string,
    options: RequestInit & { skipAuth?: boolean } = {}
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (!options.skipAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}/api${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });

    if (!response.ok) {
      const body = await response.text();
      const errorMsg = this.buildErrorMessage(response.status, body);
      throw new ProviderError('npm', errorMsg);
    }

    return response.json() as Promise<T>;
  }

  private mapHost(raw: Record<string, unknown>): ProxyHost {
    const domains = raw.domain_names as string[];
    return {
      id: String(raw.id),
      domain: domains[0] || '',
      targetHost: String(raw.forward_host),
      targetPort: Number(raw.forward_port),
      ssl: Boolean(raw.ssl_forced),
      enabled: Boolean(raw.enabled),
    };
  }
}
