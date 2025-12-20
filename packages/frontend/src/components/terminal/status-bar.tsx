import { useCallback, useEffect, useState } from 'react';
import { api, type SettingsStatus } from '../../lib/api';
import { type IpMsg, useIpMessages } from './ip-messages';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

const DISMISSED_KEY = 'autoxpose:dismissed-warnings';

function getDismissedWarnings(): Set<string> {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function setDismissedWarnings(warnings: Set<string>): void {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(warnings)));
}

type ConnectionState = 'unconfigured' | 'checking' | 'connected' | 'error';

interface SettingsStatusBarProps {
  settings: SettingsStatus | null | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  orphanCount: number;
  onOrphansClick: () => void;
}

export function SettingsStatusBar({
  settings,
  isExpanded,
  onToggle,
  orphanCount,
  onOrphansClick,
}: SettingsStatusBarProps): JSX.Element {
  const { dnsState, proxyState } = useConnectionStates(settings);
  const [dismissed, setDismissed] = useState(getDismissedWarnings);

  const handleDismiss = useCallback((key: string) => {
    setDismissed(prev => {
      const updated = new Set(prev);
      updated.add(key);
      setDismissedWarnings(updated);
      return updated;
    });
  }, []);

  const ipMessages = useIpMessages({
    serverIpState: settings?.network?.serverIpState,
    lanIpState: settings?.network?.lanIpState,
    serverIp: settings?.network?.serverIp,
    lanIp: settings?.network?.lanIp,
    detectedIp: settings?.network?.detectedIp,
    proxyConfigured: settings?.proxy?.configured ?? false,
    dismissed,
  });

  const needsSetup = dnsState !== 'connected' || proxyState !== 'connected';
  const warningCount = ipMessages.length;
  const barStyle = needsSetup
    ? 'border-[#f8514950] bg-[#f8514915]'
    : 'border-[#30363d] bg-[#161b22]';

  return (
    <div className={`border-t px-4 py-2 ${barStyle}`}>
      <StatusBarContent
        dnsState={dnsState}
        proxyState={proxyState}
        settings={settings}
        orphanCount={orphanCount}
        onOrphansClick={onOrphansClick}
        isExpanded={isExpanded}
        needsSetup={needsSetup}
        warningCount={warningCount}
        onToggle={onToggle}
        ipMessages={ipMessages}
        onDismiss={handleDismiss}
      />
    </div>
  );
}

interface StatusBarContentProps {
  dnsState: ConnectionState;
  proxyState: ConnectionState;
  settings: SettingsStatus | null | undefined;
  orphanCount: number;
  onOrphansClick: () => void;
  isExpanded: boolean;
  needsSetup: boolean;
  warningCount: number;
  onToggle: () => void;
  ipMessages: Array<IpMsg & { key: string }>;
  onDismiss: (key: string) => void;
}

const ORPHAN_BADGE_KEY = 'autoxpose:orphan-badge-minimized';

function OrphanBadge({
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

function StatusBarContent(props: StatusBarContentProps): JSX.Element {
  return (
    <>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <StatusIndicator
            label="DNS"
            state={props.dnsState}
            provider={props.settings?.dns?.provider}
          />
          <span className="text-[#30363d]">|</span>
          <StatusIndicator
            label="Proxy"
            state={props.proxyState}
            provider={props.settings?.proxy?.provider}
          />
          <StatusMessage dnsState={props.dnsState} proxyState={props.proxyState} />
        </div>
        <div className="flex items-center gap-3">
          {props.orphanCount > 0 && (
            <OrphanBadge count={props.orphanCount} onClick={props.onOrphansClick} />
          )}
          <ConfigureButton
            isExpanded={props.isExpanded}
            needsSetup={props.needsSetup}
            warningCount={props.warningCount}
            onClick={props.onToggle}
          />
        </div>
      </div>
      {props.isExpanded && props.ipMessages.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-[#30363d] pt-3">
          {props.ipMessages.map(msg => (
            <NetworkWarning
              key={msg.key}
              message={msg.text}
              dismissible={msg.dismissible}
              onDismiss={() => props.onDismiss(msg.key)}
              severity={msg.severity}
            />
          ))}
        </div>
      )}
    </>
  );
}

function useConnectionStates(settings: SettingsStatus | null | undefined): {
  dnsState: ConnectionState;
  proxyState: ConnectionState;
} {
  const [dnsState, setDnsState] = useState<ConnectionState>('unconfigured');
  const [proxyState, setProxyState] = useState<ConnectionState>('unconfigured');

  useEffect(() => {
    if (!settings?.dns?.configured) {
      setDnsState('unconfigured');
      return;
    }
    setDnsState('checking');
    api.settings
      .testDns()
      .then(r => setDnsState(r.ok ? 'connected' : 'error'))
      .catch(() => setDnsState('error'));
  }, [settings]);

  useEffect(() => {
    if (!settings?.proxy?.configured) {
      setProxyState('unconfigured');
      return;
    }
    setProxyState('checking');
    api.settings
      .testProxy()
      .then(r => setProxyState(r.ok ? 'connected' : 'error'))
      .catch(() => setProxyState('error'));
  }, [settings]);

  return { dnsState, proxyState };
}

function getStateInfo(state: ConnectionState): { icon: string; color: string; tip: string } {
  switch (state) {
    case 'connected':
      return { icon: '\u2713', color: TERMINAL_COLORS.success, tip: 'Connected' };
    case 'checking':
      return { icon: '\u25CF', color: TERMINAL_COLORS.warning, tip: 'Testing...' };
    case 'error':
      return { icon: '\u2717', color: TERMINAL_COLORS.error, tip: 'Connection failed' };
    default:
      return { icon: '\u25CB', color: TERMINAL_COLORS.textMuted, tip: 'Not configured' };
  }
}

interface StatusIndicatorProps {
  label: string;
  state: ConnectionState;
  provider: string | null | undefined;
}

function StatusIndicator({ label, state, provider }: StatusIndicatorProps): JSX.Element {
  const { icon, color, tip } = getStateInfo(state);
  const text = provider || 'none';
  const tooltip = `${label}: ${tip}`;

  return (
    <Tooltip content={tooltip}>
      <span className="flex items-center gap-1" style={{ color }}>
        <span>{icon}</span>
        <span>{text}</span>
      </span>
    </Tooltip>
  );
}

interface StatusMessageProps {
  dnsState: ConnectionState;
  proxyState: ConnectionState;
}

function StatusMessage({ dnsState, proxyState }: StatusMessageProps): JSX.Element | null {
  if (dnsState === 'connected' && proxyState === 'connected') return null;

  const messages: string[] = [];
  if (dnsState !== 'connected') messages.push('Configure DNS provider');
  if (proxyState !== 'connected') messages.push('Configure Proxy manager');

  return <span className="text-[#f85149]">{messages.join(' & ')}</span>;
}

function NetworkWarning({
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

interface ConfigureButtonProps {
  isExpanded: boolean;
  needsSetup: boolean;
  warningCount: number;
  onClick: () => void;
}

function ConfigureButton({
  isExpanded,
  needsSetup,
  warningCount,
  onClick,
}: ConfigureButtonProps): JSX.Element {
  const arrow = isExpanded ? '\u25BC' : '\u25B2';
  const baseClass = 'flex items-center gap-1 rounded px-2 py-1 transition-colors';
  const colorClass = needsSetup
    ? 'bg-[#f8514930] text-[#f85149] hover:bg-[#f8514950]'
    : 'text-[#8b949e] hover:bg-[#30363d] hover:text-[#c9d1d9]';

  const label = needsSetup ? 'Setup Required' : 'Configure';
  const tooltip = isExpanded
    ? 'Close settings'
    : warningCount > 0
      ? `Open settings (${warningCount} warning${warningCount > 1 ? 's' : ''})`
      : 'Open settings panel';

  return (
    <Tooltip content={tooltip} shortcut="Ctrl+,">
      <button onClick={onClick} className={`${baseClass} ${colorClass} relative`}>
        <span>{label}</span>
        {!isExpanded && warningCount > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#f0883e] text-[9px] font-bold text-[#0d1117]">
            {warningCount}
          </span>
        )}
        <span className="text-[10px]">{arrow}</span>
      </button>
    </Tooltip>
  );
}
