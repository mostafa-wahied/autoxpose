import { useEffect } from 'react';

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

function trySettingsShortcut(
  key: string,
  event: KeyboardEvent,
  isOpen: boolean,
  toggle: (open: boolean) => void
): boolean {
  const isSettingsKey = key === ',' || key === 'comma';
  if (!isSettingsKey || event.shiftKey) return false;
  event.preventDefault();
  toggle(!isOpen);
  return true;
}

function handleActionShortcut(
  event: KeyboardEvent,
  actions: {
    canExpose: boolean;
    onExposeAll: () => void;
    onUnexposeAll: () => void;
    onScan: () => void;
  }
): void {
  if (!event.altKey) return;
  const code = event.code.toLowerCase();
  if (code === 'keye') {
    event.preventDefault();
    if (actions.canExpose) actions.onExposeAll();
    return;
  }
  if (code === 'keyu') {
    event.preventDefault();
    actions.onUnexposeAll();
    return;
  }
  if (code === 'keys') {
    event.preventDefault();
    actions.onScan();
  }
}

export function useTerminalShortcuts(params: {
  onExposeAll: () => void;
  onUnexposeAll: () => void;
  onScan: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  canExpose: boolean;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
}): void {
  const {
    onExposeAll,
    onUnexposeAll,
    onScan,
    settingsOpen,
    setSettingsOpen,
    canExpose,
    shortcutsOpen,
    setShortcutsOpen,
  } = params;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (isTextTarget(event.target)) return;
      const key = event.key.toLowerCase();

      if (key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setShortcutsOpen(!shortcutsOpen);
        return;
      }

      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl) return;

      const toggled = trySettingsShortcut(key, event, settingsOpen, setSettingsOpen);
      if (toggled) return;

      handleActionShortcut(event, {
        canExpose,
        onExposeAll,
        onUnexposeAll,
        onScan,
      });
    };

    const remove = (): void => window.removeEventListener('keydown', handleShortcut);
    window.addEventListener('keydown', handleShortcut);
    return remove;
  }, [
    canExpose,
    onExposeAll,
    onScan,
    onUnexposeAll,
    setSettingsOpen,
    settingsOpen,
    shortcutsOpen,
    setShortcutsOpen,
  ]);
}
