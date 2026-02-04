import type { DnsRecord } from '../dns/dns.types.js';
import type { ProxyHost } from '../proxy/proxy.types.js';

interface ServiceForMatching {
  subdomain: string;
  name: string;
  port: number;
}

export function fuzzyMatchSubdomain(subdomain: string, containerName: string): boolean {
  const sub = subdomain.toLowerCase();
  const name = containerName.toLowerCase();
  return name === sub || name.includes(sub) || name.split(/[-_]/).some(part => part === sub);
}

export function isCleanerSubdomain(discovered: string, current: string): boolean {
  return (
    discovered.length < current.length ||
    (current.startsWith('ix-') && !discovered.startsWith('ix-')) ||
    current.split('-').length !== new Set(current.split('-')).size
  );
}

export function getExposedSubdomain(
  proxyHost: ProxyHost | null,
  baseDomain: string
): string | null {
  if (!proxyHost) return null;
  if (!baseDomain) return proxyHost.domain;
  if (!proxyHost.domain.endsWith(`.${baseDomain}`)) return null;
  return proxyHost.domain.replace(`.${baseDomain}`, '');
}

export function findMatchingDnsRecord(
  service: ServiceForMatching,
  records: DnsRecord[],
  baseDomain: string
): DnsRecord | undefined {
  const exactDomain = baseDomain ? `${service.subdomain}.${baseDomain}` : service.subdomain;
  const exactMatch = records.find(r => r.hostname === exactDomain && r.type === 'A');
  if (exactMatch) return exactMatch;

  const recordsOnDomain = baseDomain
    ? records.filter(r => r.hostname.endsWith(`.${baseDomain}`))
    : records;

  return recordsOnDomain.find(r => {
    if (r.type !== 'A') return false;
    const recordSub = baseDomain ? r.hostname.replace(`.${baseDomain}`, '') : r.hostname;
    return recordSub && fuzzyMatchSubdomain(recordSub, service.name);
  });
}

export function findMatchingProxyHost(
  service: ServiceForMatching,
  hosts: ProxyHost[],
  baseDomain: string
): ProxyHost | undefined {
  const exactDomain = baseDomain ? `${service.subdomain}.${baseDomain}` : service.subdomain;
  const exactMatch = hosts.find(h => h.domain === exactDomain);
  if (exactMatch) return exactMatch;

  const hostsOnDomain = baseDomain ? hosts.filter(h => h.domain.endsWith(`.${baseDomain}`)) : hosts;

  const fuzzyMatch = hostsOnDomain.find(h => {
    const hostSub = baseDomain ? h.domain.replace(`.${baseDomain}`, '') : h.domain;
    return hostSub && fuzzyMatchSubdomain(hostSub, service.name);
  });
  if (fuzzyMatch) return fuzzyMatch;

  return hostsOnDomain.find(h => h.targetPort === service.port);
}
