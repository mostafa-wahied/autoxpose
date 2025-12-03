const API_BASE = '/api';

export interface ServiceRecord {
  id: string;
  name: string;
  domain: string;
  port: number;
  scheme: string | null;
  enabled: boolean | null;
  source: string;
  sourceId: string | null;
  dnsRecordId: string | null;
  proxyHostId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DiscoveredContainer {
  id: string;
  name: string;
  domain: string;
  port: number;
  scheme: string;
  source: string;
}

export interface ProviderStatus {
  configured: boolean;
  provider: string | null;
  config: Record<string, string> | null;
}

export interface PlatformInfo {
  name: string;
  os: string;
}

export interface SettingsStatus {
  dns: ProviderStatus;
  proxy: ProviderStatus;
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
      domain: string;
      port: number;
      scheme?: string;
    }): Promise<{ service: ServiceRecord }> =>
      request<{ service: ServiceRecord }>('/services', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{ name: string; domain: string; port: number; enabled: boolean }>
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
    saveDns: (provider: string, config: Record<string, string>): Promise<{ success: boolean }> =>
      request<{ success: boolean }>('/settings/dns', {
        method: 'POST',
        body: JSON.stringify({ provider, config }),
      }),
    saveProxy: (provider: string, config: Record<string, string>): Promise<{ success: boolean }> =>
      request<{ success: boolean }>('/settings/proxy', {
        method: 'POST',
        body: JSON.stringify({ provider, config }),
      }),
  },
};
