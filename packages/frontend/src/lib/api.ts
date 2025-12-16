const API_BASE = '/api';

export interface ServiceRecord {
  id: string;
  name: string;
  subdomain: string;
  port: number;
  scheme: string | null;
  enabled: boolean | null;
  source: string;
  sourceId: string | null;
  dnsRecordId: string | null;
  proxyHostId: number | null;
  exposureSource: string | null;
  dnsExists: boolean | null;
  proxyExists: boolean | null;
  lastReachabilityCheck: string | null;
  reachabilityStatus: string | null;
  configWarnings: string | null;
  exposedSubdomain: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DiscoveredContainer {
  id: string;
  name: string;
  subdomain: string;
  port: number;
  scheme: string;
  source: string;
}

export interface ProviderStatus {
  configured: boolean;
  provider: string | null;
  config: Record<string, string> | null;
}

export interface DnsStatus extends ProviderStatus {
  domain: string | null;
}

export interface NetworkStatus {
  serverIp: string;
  lanIp: string;
  serverIpState: IpState;
  lanIpState: IpState;
  detectedIp: string | null;
}

export type IpState =
  | 'valid'
  | 'missing'
  | 'invalid'
  | 'placeholder'
  | 'bridge-autodetected'
  | 'mismatch';

export interface PlatformInfo {
  name: string;
  os: string;
}

export interface SettingsStatus {
  dns: DnsStatus;
  proxy: ProviderStatus;
  network?: NetworkStatus;
  platform?: PlatformInfo;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

export const api = {
  services: {
    list: (): Promise<{ services: ServiceRecord[] }> =>
      request<{ services: ServiceRecord[] }>('/services'),
    get: (id: string): Promise<{ service: ServiceRecord }> =>
      request<{ service: ServiceRecord }>(`/services/${id}`),
    create: (data: {
      name: string;
      subdomain: string;
      port: number;
      scheme?: string;
    }): Promise<{ service: ServiceRecord }> =>
      request<{ service: ServiceRecord }>('/services', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        name: string;
        subdomain: string;
        port: number;
        scheme: string;
        enabled: boolean;
      }>
    ): Promise<{ service: ServiceRecord }> =>
      request<{ service: ServiceRecord }>(`/services/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string): Promise<{ success: boolean }> =>
      request<{ success: boolean }>(`/services/${id}`, { method: 'DELETE' }),
    expose: (id: string): Promise<{ service: ServiceRecord }> =>
      request<{ service: ServiceRecord }>(`/services/${id}/expose`, { method: 'POST' }),
    unexpose: (id: string): Promise<{ service: ServiceRecord }> =>
      request<{ service: ServiceRecord }>(`/services/${id}/unexpose`, { method: 'POST' }),
    checkOnline: (id: string): Promise<{ online: boolean; domain?: string }> =>
      request<{ online: boolean; domain?: string }>(`/services/${id}/online`, { method: 'POST' }),
    retrySsl: (id: string): Promise<{ success: boolean; error?: string }> =>
      request<{ success: boolean; error?: string }>(`/services/${id}/retry-ssl`, {
        method: 'POST',
      }),
  },
  discovery: {
    containers: (): Promise<{ containers: DiscoveredContainer[] }> =>
      request<{ containers: DiscoveredContainer[] }>('/discovery/containers'),
    scan: (): Promise<{ discovered: number; created: number; updated: number; removed: number }> =>
      request<{ discovered: number; created: number; updated: number; removed: number }>(
        '/discovery/scan',
        { method: 'POST' }
      ),
  },
  settings: {
    status: (): Promise<SettingsStatus> => request<SettingsStatus>('/settings/status'),
    saveDns: (
      provider: string,
      config: Record<string, string>
    ): Promise<{ success: boolean; validation?: { ok: boolean; error?: string } }> =>
      request<{ success: boolean; validation?: { ok: boolean; error?: string } }>('/settings/dns', {
        method: 'POST',
        body: JSON.stringify({ provider, config }),
      }),
    saveProxy: (
      provider: string,
      config: Record<string, string>
    ): Promise<{ success: boolean; validation?: { ok: boolean; error?: string } }> =>
      request<{ success: boolean; validation?: { ok: boolean; error?: string } }>(
        '/settings/proxy',
        {
          method: 'POST',
          body: JSON.stringify({ provider, config }),
        }
      ),
    testDns: (): Promise<{ ok: boolean; error?: string }> =>
      request<{ ok: boolean; error?: string }>('/settings/dns/test', { method: 'POST' }),
    testProxy: (): Promise<{ ok: boolean; error?: string }> =>
      request<{ ok: boolean; error?: string }>('/settings/proxy/test', { method: 'POST' }),
  },
};
