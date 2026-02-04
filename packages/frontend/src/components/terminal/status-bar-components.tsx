import { useEffect, useState } from 'react';
import { Tooltip } from './tooltip';

const ORPHAN_BADGE_KEY = 'autoxpose:orphan-badge-minimized';

export function OrphanBadge({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}): JSX.Element | null {
  const [isMinimized, setIsMinimized] = useState(() => {
    try {
      return localStorage.getItem(ORPHAN_BADGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ORPHAN_BADGE_KEY, String(isMinimized));
    } catch {
      return;
    }
  }, [isMinimized]);

  if (count === 0) return null;

  const handleMinimize = (e: React.MouseEvent): void => {
    e.stopPropagation();
    setIsMinimized(true);
  };

  const handleExpand = (e: React.MouseEvent): void => {
    e.stopPropagation();
    setIsMinimized(false);
  };

  if (isMinimized) {
    return (
      <Tooltip content="Container stopped but DNS/proxy records still exist">
        <button
          onClick={handleExpand}
          className="h-2 w-2 rounded-full bg-[#f0883e] transition-transform hover:scale-125"
          aria-label="Expand orphaned services badge"
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip content="Container stopped but DNS/proxy records still exist">
      <button
        onClick={onClick}
        className="group flex items-center gap-1.5 rounded bg-[#f0883e20] px-2 py-1 transition-all hover:bg-[#f0883e30]"
      >
        <span className="text-xs font-medium text-[#f0883e]">{count} orphaned</span>
        <button
          onClick={handleMinimize}
          className="flex h-3.5 w-3.5 items-center justify-center rounded text-[#f0883e] opacity-0 transition-opacity hover:bg-[#f0883e40] group-hover:opacity-100"
          aria-label="Minimize badge"
        >
          −
        </button>
      </button>
    </Tooltip>
  );
}

export function NetworkWarning({
  message,
  dismissible,
  onDismiss,
  severity,
}: {
  message: string;
  dismissible: boolean;
  onDismiss: () => void;
  severity: 'error' | 'warning' | 'info';
}): JSX.Element {
  const colors = {
    error: { text: 'text-[#f85149]', bg: 'bg-[#f8514915]', border: 'border-[#f8514950]' },
    warning: { text: 'text-[#f0883e]', bg: 'bg-[#f0883e15]', border: 'border-[#f0883e50]' },
    info: { text: 'text-[#58a6ff]', bg: 'bg-[#58a6ff15]', border: 'border-[#58a6ff50]' },
  };

  const icons = {
    error: '\u2717',
    warning: '\u26A0',
    info: '\u2139',
  };

  const { text, bg, border } = colors[severity];
  const icon = icons[severity];

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded border px-3 py-2 ${text} ${bg} ${border}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-xs">{message}</span>
      </div>
      {dismissible && (
        <Tooltip content="Dismiss">
          <button
            onClick={onDismiss}
            className={`rounded px-2 py-1 text-[10px] transition-colors hover:bg-[#30363d] ${text}`}
            aria-label="Dismiss warning"
          >
            ✕
          </button>
        </Tooltip>
      )}
    </div>
  );
}
