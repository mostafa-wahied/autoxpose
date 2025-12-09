import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type IpState, type SettingsStatus } from '../../lib/api';
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
}

export function SettingsStatusBar({
  settings,
  isExpanded,
  onToggle,
}: SettingsStatusBarProps): JSX.Element {
  const { dnsState, proxyState } = useConnectionStates(settings);
  const [dismissed, setDismissed] = useState(getDismissedWarnings);

  const serverIpState = settings?.network?.serverIpState;
  const lanIpState = settings?.network?.lanIpState;
  const serverIp = settings?.network?.serverIp;
  const lanIp = settings?.network?.lanIp;
  const detectedIp = settings?.network?.detectedIp;
  const proxyConfigured = settings?.proxy?.configured ?? false;

  const handleDismiss = useCallback((key: string) => {
    setDismissed(prev => {
      const updated = new Set(prev);
      updated.add(key);
      setDismissedWarnings(updated);
      return updated;
    });
  }, []);

  const ipMessages = useIpMessages({
    serverIpState,
    lanIpState,
    serverIp,
    lanIp,
    detectedIp,
    proxyConfigured,
    dismissed,
  });

  const needsSetup = dnsState !== 'connected' || proxyState !== 'connected';
  const warningCount = ipMessages.length;
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
        </div>
        <ConfigureButton
          isExpanded={isExpanded}
          needsSetup={needsSetup}
          warningCount={warningCount}
          onClick={onToggle}
        />
      </div>
      {isExpanded && ipMessages.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-[#30363d] pt-3">
          {ipMessages.map(msg => (
            <NetworkWarning
              key={msg.key}
              message={msg.text}
              dismissible={msg.dismissible}
              onDismiss={() => handleDismiss(msg.key)}
              severity={msg.severity}
            />
          ))}
        </div>
      )}
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

type IpMsg = {
  text: string;
  dismissible: boolean;
  severity: 'error' | 'warning' | 'info';
};

function getServerIpMessage(state: IpState, ip: string, detected: string | null): IpMsg {
  const msgs: Record<IpState, IpMsg> = {
    missing: {
      text: `Server IP: localhost (set SERVER_IP)`,
      dismissible: false,
      severity: 'error',
    },
    invalid: { text: `Server IP: invalid format "${ip}"`, dismissible: false, severity: 'error' },
    placeholder: {
      text: `Server IP: placeholder "${ip}" (set real IP)`,
      dismissible: false,
      severity: 'error',
    },
    valid: { text: '', dismissible: false, severity: 'info' },
    'bridge-autodetected': { text: '', dismissible: false, severity: 'info' },
    mismatch: {
      text: detected ? `Server IP: ${ip} but detected ${detected} (VPN?)` : '',
      dismissible: true,
      severity: 'warning',
    },
  };
  return msgs[state];
}

function getLanIpMessage(state: IpState, ip: string): IpMsg {
  const msgs: Record<IpState, IpMsg> = {
    missing: { text: '', dismissible: false, severity: 'info' },
    invalid: { text: `LAN IP: invalid format "${ip}"`, dismissible: false, severity: 'error' },
    placeholder: {
      text: `LAN IP: placeholder "${ip}" (set real IP)`,
      dismissible: false,
      severity: 'error',
    },
    valid: { text: '', dismissible: false, severity: 'info' },
    'bridge-autodetected': {
      text: `LAN IP: auto-detected ${ip} (set LAN_IP if needed)`,
      dismissible: true,
      severity: 'info',
    },
    mismatch: { text: '', dismissible: false, severity: 'info' },
  };
  return msgs[state];
}

function buildIpMessages(p: {
  srv: IpState | undefined;
  lan: IpState | undefined;
  srvIp: string;
  lanIp: string;
  det: string | null;
  proxyCfg: boolean;
  dis: Set<string>;
}): Array<IpMsg & { key: string }> {
  const res: Array<IpMsg & { key: string }> = [];

  if (p.srv && p.srv !== 'valid') {
    const k = `server:${p.srv}:${p.srvIp}`;
    if (!p.dis.has(k)) {
      const m = getServerIpMessage(p.srv, p.srvIp, p.det);
      if (m.text) res.push({ ...m, key: k });
    }
  }

  if (p.lan && p.lan !== 'valid' && p.proxyCfg) {
    const k = `lan:${p.lan}:${p.lanIp}`;
    if (!p.dis.has(k)) {
      const m = getLanIpMessage(p.lan, p.lanIp);
      if (m.text) res.push({ ...m, key: k });
    }
  }

  return res;
}

function useIpMessages(params: {
  serverIpState: IpState | undefined;
  lanIpState: IpState | undefined;
  serverIp: string | undefined;
  lanIp: string | undefined;
  detectedIp: string | null | undefined;
  proxyConfigured: boolean;
  dismissed: Set<string>;
}): Array<IpMsg & { key: string }> {
  const { serverIpState, lanIpState, serverIp, lanIp, detectedIp, proxyConfigured, dismissed } =
    params;
  return useMemo(
    () =>
      buildIpMessages({
        srv: serverIpState,
        lan: lanIpState,
        srvIp: serverIp || '',
        lanIp: lanIp || '',
        det: detectedIp || null,
        proxyCfg: proxyConfigured,
        dis: dismissed,
      }),
    [serverIpState, lanIpState, serverIp, lanIp, detectedIp, proxyConfigured, dismissed]
  );
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
