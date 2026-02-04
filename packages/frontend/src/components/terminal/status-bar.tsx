import { useCallback, useEffect, useState } from 'react';
import { api, type SettingsStatus } from '../../lib/api';
import { type IpMsg, useIpMessages } from './ip-messages';
import { NetworkWarning, OrphanBadge } from './status-bar-components';
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

  const isWildcardMode = settings?.wildcard?.enabled ?? false;
  const dnsReady = isWildcardMode || dnsState === 'connected';
  const needsSetup = !dnsReady || proxyState !== 'connected';
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

function StatusBarContent(props: StatusBarContentProps): JSX.Element {
  const isWildcardMode = props.settings?.wildcard?.enabled ?? false;
  const wildcardDomain = props.settings?.wildcard?.domain;

  return (
    <>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          {isWildcardMode && wildcardDomain ? (
            <WildcardIndicator domain={wildcardDomain} />
          ) : (
            <StatusIndicator
              label="DNS"
              state={props.dnsState}
              provider={props.settings?.dns?.provider}
            />
          )}
          <span className="text-[#30363d]">|</span>
          <StatusIndicator
            label="Proxy"
            state={props.proxyState}
            provider={props.settings?.proxy?.provider}
          />
          <StatusMessage
            dnsState={isWildcardMode ? 'connected' : props.dnsState}
            proxyState={props.proxyState}
          />
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

function WildcardIndicator({ domain }: { domain: string }): JSX.Element {
  return (
    <Tooltip content="Wildcard mode: DNS and SSL handled by wildcard certificate">
      <span className="flex items-center gap-1" style={{ color: TERMINAL_COLORS.success }}>
        <span>{'\u2713'}</span>
        <span className="font-mono">*.{domain}</span>
      </span>
    </Tooltip>
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
