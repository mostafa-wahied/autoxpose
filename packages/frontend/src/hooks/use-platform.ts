import { useMemo } from 'react';

export function usePlatform(): { isMac: boolean; modKey: string; altKey: string } {
  const isMac = useMemo(() => navigator.platform.toLowerCase().includes('mac'), []);

  const modKey = useMemo(() => (isMac ? '⌘' : 'Ctrl'), [isMac]);
  const altKey = useMemo(() => (isMac ? '⌥' : 'Alt'), [isMac]);

  return { isMac, modKey, altKey };
}
