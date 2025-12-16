import { useEffect, useMemo } from 'react';
import { usePlatform } from '../../hooks/use-platform';

type KeyboardShortcutsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps): JSX.Element | null {
  const { modKey, altKey } = usePlatform();

  const shortcuts = useMemo(() => {
    return {
      settings: `${modKey} + ,`,
      exposeAll: `${modKey} + ${altKey} + E`,
      unexposeAll: `${modKey} + ${altKey} + U`,
      scan: `${modKey} + ${altKey} + S`,
    };
  }, [modKey, altKey]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    const cleanup = (): void => window.removeEventListener('keydown', handleEscape);
    window.addEventListener('keydown', handleEscape);
    return cleanup;
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div
        className="max-w-2xl rounded bg-[#0d1117] p-8 font-mono text-sm text-[#c9d1d9]"
        onClick={e => e.stopPropagation()}
      >
        <pre className="select-none text-[#8b949e]">
          {`┌─────────────────────────────────────────────────────────────┐
│                    KEYBOARD SHORTCUTS                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GLOBAL SHORTCUTS                                           │
│  ─────────────────                                          │
│                                                             │
│  ${shortcuts.settings.padEnd(19)} Toggle settings panel                   │
│  ${shortcuts.exposeAll.padEnd(19)} Expose all services                     │
│  ${shortcuts.unexposeAll.padEnd(19)} Unexpose all services                   │
│  ${shortcuts.scan.padEnd(19)} Scan containers                         │
│                                                             │
│  COMMAND CONSOLE                                            │
│  ────────────────                                           │
│                                                             │
│  Tab                Select / cycle suggestions forward      │
│  Shift + Tab        Cycle suggestions backward              │
│  ↑                  Navigate history / suggestions up       │
│  ↓                  Navigate history / suggestions down     │
│  Enter              Execute command / select suggestion     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Press ? or Esc to close                                    │
└─────────────────────────────────────────────────────────────┘`}
        </pre>
      </div>
    </div>
  );
}
