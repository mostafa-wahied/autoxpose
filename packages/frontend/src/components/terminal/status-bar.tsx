import { useEffect, useState } from 'react';
import { api, type SettingsStatus } from '../../lib/api';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

type ConnectionState = 'unconfigured' | 'checking' | 'connected' | 'error';

interface SettingsStatusBarProps {
  settings: SettingsStatus | null | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}

export function SettingsStatusBar({
  settings,
  isExpanded,
  onToggle,
}: SettingsStatusBarProps): JSX.Element {
  const { dnsState, proxyState } = useConnectionStates(settings);
  const serverIpWarning = settings?.network?.serverIpWarning;
  const lanIpWarning = settings?.network?.lanIpWarning;
  const serverIp = settings?.network?.serverIp;
  const lanIp = settings?.network?.lanIp;

  const needsSetup = dnsState !== 'connected' || proxyState !== 'connected';
  const barStyle = needsSetup
    ? 'border-[#f8514950] bg-[#f8514915]'
    : 'border-[#30363d] bg-[#161b22]';

  return (
    <div className={`border-t px-4 py-2 ${barStyle}`}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <StatusIndicator label="DNS" state={dnsState} provider={settings?.dns?.provider} />
          <span className="text-[#30363d]">|</span>
          <StatusIndicator label="Proxy" state={proxyState} provider={settings?.proxy?.provider} />
          <StatusMessage dnsState={dnsState} proxyState={proxyState} />
          <NetworkNotice
            serverWarning={serverIpWarning}
            lanWarning={lanIpWarning}
            serverIp={serverIp}
            lanIp={lanIp}
          />
        </div>
        <ConfigureButton isExpanded={isExpanded} needsSetup={needsSetup} onClick={onToggle} />
      </div>
    </div>
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
  const fullTip = provider ? `${tip} - ${provider}` : tip;
  return (
    <Tooltip content={fullTip}>
      <div className="flex items-center gap-1.5">
        <span className="text-[#8b949e]">{label}:</span>
        <span style={{ color }}>{icon}</span>
        {provider && state === 'connected' && <span className="text-[#8b949e]">{provider}</span>}
      </div>
    </Tooltip>
  );
}

function StatusMessage({
  dnsState,
  proxyState,
}: {
  dnsState: ConnectionState;
  proxyState: ConnectionState;
}): JSX.Element | null {
  if (dnsState === 'connected' && proxyState === 'connected') return null;
  if (dnsState === 'checking' || proxyState === 'checking') {
    return <span className="text-[#f0883e]">Verifying connections...</span>;
  }
  if (dnsState === 'error' || proxyState === 'error') {
    return <span className="text-[#f85149]">Connection failed - check settings</span>;
  }
  return <span className="animate-pulse text-[#f85149]">Setup required to expose services</span>;
}

function NetworkNotice({
  serverWarning,
  lanWarning,
  serverIp,
  lanIp,
}: {
  serverWarning: boolean | undefined;
  lanWarning: boolean | undefined;
  serverIp: string | undefined;
  lanIp: string | undefined;
}): JSX.Element | null {
  const notices: string[] = [];
  if (serverWarning) {
    notices.push(
      `Public IP not set (current: ${serverIp || 'unknown'}) - set SERVER_IP env before exposing`
    );
  }
  if (lanWarning) {
    notices.push(`LAN IP not set (current: ${lanIp || 'unknown'}) - set LAN_IP env for proxy`);
  }
  if (notices.length === 0) return null;
  return <span className="text-[#f0883e]">{notices.join(' | ')}</span>;
}

interface ConfigureButtonProps {
  isExpanded: boolean;
  needsSetup: boolean;
  onClick: () => void;
}

function ConfigureButton({ isExpanded, needsSetup, onClick }: ConfigureButtonProps): JSX.Element {
  const arrow = isExpanded ? '\u25BC' : '\u25B2';
  const baseClass = 'flex items-center gap-1 rounded px-2 py-1 transition-colors';
  const colorClass = needsSetup
    ? 'bg-[#f8514930] text-[#f85149] hover:bg-[#f8514950]'
    : 'text-[#8b949e] hover:bg-[#30363d] hover:text-[#c9d1d9]';

  return (
    <Tooltip content={isExpanded ? 'Close settings' : 'Open settings panel'} shortcut="Ctrl+,">
      <button onClick={onClick} className={`${baseClass} ${colorClass}`}>
        <span>{needsSetup ? 'Setup Required' : 'Configure'}</span>
        <span className="text-[10px]">{arrow}</span>
      </button>
    </Tooltip>
  );
}
