import { platform, release } from 'os';
import { existsSync, readFileSync } from 'fs';
import { createLogger } from './logger/index.js';

const logger = createLogger('platform');

type PlatformInfo = { name: string; os: string };

type IpCache = {
  ip: string;
  timestamp: number;
};

let cache: IpCache | null = null;
const CACHE_TTL = 60 * 60 * 1000;

const PLATFORM_MARKERS: Array<{ path: string; name: string }> = [
  { path: '/etc/unraid-version', name: 'Unraid' },
  { path: '/etc/UNRAID_VERSION', name: 'Unraid' },
  { path: '/etc/synology_user', name: 'Synology' },
  { path: '/etc/VERSION', name: 'Synology' },
];

function detectNasFromFiles(): string | null {
  for (const marker of PLATFORM_MARKERS) {
    if (existsSync(marker.path)) {
      return marker.name;
    }
  }

  if (existsSync('/etc/VERSION')) {
    try {
      const content = readFileSync('/etc/VERSION', 'utf-8');
      if (content.includes('synology')) return 'Synology';
    } catch {
      return null;
    }
  }

  return null;
}

function detectFromRelease(rel: string): string | null {
  const lower = rel.toLowerCase();
  if (lower.includes('truenas')) return 'TrueNAS';
  if (lower.includes('freenas')) return 'TrueNAS';
  if (lower.includes('unraid')) return 'Unraid';
  return null;
}

export function detectPlatform(): PlatformInfo {
  const os = platform();

  if (os === 'win32') return { name: 'Windows', os: 'windows' };
  if (os === 'darwin') return { name: 'macOS', os: 'darwin' };

  const rel = release();
  const fromRelease = detectFromRelease(rel);
  if (fromRelease) return { name: fromRelease, os: 'linux' };

  const fromFiles = detectNasFromFiles();
  if (fromFiles) return { name: fromFiles, os: 'linux' };

  return { name: 'Linux', os: 'linux' };
}

export async function detectPublicIp(): Promise<string | null> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.ip;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('http://icanhazip.com', {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const ip = (await response.text()).trim();
    cache = { ip, timestamp: Date.now() };
    logger.info({ detectedIp: ip }, 'Public IP detected');
    return ip;
  } catch (error) {
    logger.debug({ error }, 'Public IP detection failed (VPN/offline/timeout)');
    return null;
  }
}

export type IpState =
  | 'valid'
  | 'missing'
  | 'invalid'
  | 'placeholder'
  | 'bridge-autodetected'
  | 'mismatch';

export function determineIpState(
  ip: string,
  provided: boolean,
  isBridge: boolean,
  detectedIp?: string | null
): IpState {
  if (ip === 'localhost') return 'missing';
  if (ip.toLowerCase() === 'your-public-ip' || ip.toLowerCase() === 'your-lan-ip')
    return 'placeholder';
  if (!isValidIpFormat(ip)) return 'invalid';
  if (!provided && isBridge) return 'bridge-autodetected';
  const cleaned = ip.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const isHostname = !isIpv4(cleaned);
  if (detectedIp && !isHostname && cleaned !== detectedIp) return 'mismatch';
  return 'valid';
}

export function isIpv4(value: string): boolean {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value);
}

export function isValidIpFormat(value: string): boolean {
  const cleaned = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (isIpv4(cleaned)) return true;
  const hostname = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
  return hostname.test(cleaned);
}

export function isBridgeIp(value: string): boolean {
  return value.startsWith('172.') || value.startsWith('169.254.');
}
