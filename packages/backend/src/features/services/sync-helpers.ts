import type { ProxyHost } from '../proxy/proxy.types.js';

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
  return baseDomain ? proxyHost.domain.replace(`.${baseDomain}`, '') : proxyHost.domain;
}
