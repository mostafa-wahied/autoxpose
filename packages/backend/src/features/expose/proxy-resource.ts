import type { AccessListService } from '../access-lists/access-list.service.js';
import type { ServiceRecord } from '../services/services.repository.js';
import type { SettingsService } from '../settings/settings.service.js';

export type ProxyResource = {
  id: string;
  sslPending?: boolean;
  sslError?: string;
  accessListId?: number | null;
};

type Options = {
  service: ServiceRecord;
  domain: string;
  wildcard: boolean;
  settings: SettingsService;
  lanIp: string;
  accessLists?: AccessListService;
};

export async function createProxyResource(options: Options): Promise<ProxyResource | undefined> {
  const { service, domain, wildcard, settings, lanIp, accessLists } = options;
  const proxy = await settings.getProxyProvider();
  if (!proxy) return undefined;
  let certificateId: number | undefined;
  if (wildcard) {
    const config = await settings.getWildcardConfig();
    if (config?.certId) certificateId = config.certId;
  }
  const prepared = accessLists
    ? await accessLists.prepareProxyHost(service, proxy, domain)
    : undefined;
  if (prepared?.host) {
    return {
      id: prepared.host.id,
      sslPending: prepared.host.sslPending,
      sslError: prepared.host.sslError,
      accessListId: prepared.accessListId || null,
    };
  }
  const host = await proxy.createHost({
    domain,
    targetHost: lanIp,
    targetPort: service.port,
    targetScheme: (service.scheme as 'http' | 'https') || 'http',
    ssl: true,
    certificateId,
    accessListId: prepared?.accessListId,
  });
  return {
    id: host.id,
    sslPending: host.sslPending,
    sslError: host.sslError,
    ...(accessLists && { accessListId: host.accessListId || null }),
  };
}
