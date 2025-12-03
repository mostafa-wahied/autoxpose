import { platform, release } from 'os';
import { existsSync, readFileSync } from 'fs';

type PlatformInfo = { name: string; os: string };

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
