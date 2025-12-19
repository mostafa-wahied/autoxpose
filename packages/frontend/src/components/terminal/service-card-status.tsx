import { useEffect, useState } from 'react';
import { api, type ServiceRecord } from '../../lib/api';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

interface StatusBadgeProps {
  serviceId: string;
  isExposed: boolean;
  service: ServiceRecord;
  onProtocolChange: (protocol: 'https' | 'http' | null) => void;
  scanTrigger?: number;
}

export function StatusBadge({
  serviceId,
  isExposed,
  service,
  onProtocolChange,
  scanTrigger,
}: StatusBadgeProps): JSX.Element {
  const [liveStatus, setLiveStatus] = useState<'checking' | 'online' | 'offline' | null>(null);

  useEffect(() => {
    if (!isExposed) {
      setLiveStatus(null);
      onProtocolChange(null);
      return;
    }
    setLiveStatus('checking');
    api.services
      .checkOnline(serviceId)
      .then(res => {
        setLiveStatus(res.online ? 'online' : 'offline');
        onProtocolChange(res.protocol || null);
      })
      .catch(() => {
        setLiveStatus('offline');
        onProtocolChange(null);
      });
  }, [serviceId, isExposed, onProtocolChange, scanTrigger]);

  return (
    <div className="flex items-center gap-2">
      <StatusIndicator
        isExposed={isExposed}
        liveStatus={liveStatus}
        dnsExists={service.dnsExists}
        proxyExists={service.proxyExists}
        sslPending={service.sslPending}
      />
      <ServiceWarnings service={service} isExposed={isExposed} liveStatus={liveStatus} />
    </div>
  );
}

function ServiceWarnings({
  service,
  isExposed,
  liveStatus,
}: {
  service: ServiceRecord;
  isExposed: boolean;
  liveStatus: string | null;
}): JSX.Element {
  const warnings = parseWarnings(service.configWarnings);
  const showUnreachableReasons = isExposed && liveStatus === 'offline';

  const warningBadges = [
    {
      show: showUnreachableReasons && service.dnsExists === false,
      type: 'DNS',
      msg: 'DNS record missing',
    },
    {
      show: showUnreachableReasons && service.proxyExists === false,
      type: 'Proxy',
      msg: 'Proxy host missing',
    },
    {
      show: showUnreachableReasons && service.dnsExists === null,
      type: 'DNS?',
      msg: 'DNS status unknown',
    },
    {
      show: showUnreachableReasons && service.proxyExists === null,
      type: 'Proxy?',
      msg: 'Proxy status unknown',
    },
    { show: warnings.port_mismatch, type: 'Port', msg: 'Port mismatch detected' },
    { show: warnings.scheme_mismatch, type: 'Scheme', msg: 'Scheme mismatch detected' },
    { show: warnings.ip_mismatch, type: 'IP', msg: 'IP address mismatch detected' },
  ];

  const icons = [
    {
      show: service.exposureSource === 'discovered',
      type: 'discovered',
      msg: 'Discovered existing configuration',
    },
    { show: service.exposureSource === 'auto', type: 'auto', msg: 'Auto-exposed on discovery' },
  ];

  return (
    <>
      {warningBadges.map(
        (w, i) => w.show && <WarningBadge key={i} type={w.type} message={w.msg} />
      )}
      {icons.map((ic, i) => ic.show && <ExposureIcon key={i} type={ic.type} message={ic.msg} />)}
    </>
  );
}

function StatusIndicator({
  isExposed,
  liveStatus,
  sslPending,
}: {
  isExposed: boolean;
  liveStatus: string | null;
  dnsExists: boolean | null;
  proxyExists: boolean | null;
  sslPending: boolean | null;
}): JSX.Element {
  const getStatus = (): { tip: string; color: string; label: string } => {
    if (!isExposed)
      return {
        tip: 'Service not exposed',
        color: TERMINAL_COLORS.textMuted,
        label: '\u25CB OFFLINE',
      };
    if (liveStatus === 'checking')
      return { tip: 'Checking...', color: TERMINAL_COLORS.warning, label: '\u25CF CHECKING' };
    if (liveStatus === 'online' && sslPending)
      return {
        tip: 'Service reachable via HTTP only. SSL setup pending or failed.',
        color: TERMINAL_COLORS.warning,
        label: '\u25CF HTTP ONLY',
      };
    if (liveStatus === 'online')
      return { tip: 'Domain reachable', color: TERMINAL_COLORS.success, label: '\u25CF ONLINE' };
    return {
      tip: 'Domain not reachable',
      color: TERMINAL_COLORS.error,
      label: '\u25CF UNREACHABLE',
    };
  };

  const { tip, color, label } = getStatus();
  return (
    <Tooltip content={tip}>
      <span
        className="rounded px-2 py-0.5 text-xs font-medium"
        style={{ background: `${color}20`, color }}
      >
        {label}
      </span>
    </Tooltip>
  );
}

function WarningBadge({ type, message }: { type: string; message: string }): JSX.Element {
  const isError = type === 'DNS' || type === 'Proxy';
  const color = isError ? TERMINAL_COLORS.error : TERMINAL_COLORS.warning;
  return (
    <Tooltip content={message}>
      <span
        className="rounded px-2 py-0.5 text-xs font-medium"
        style={{ background: `${color}20`, color }}
      >
        {type}
      </span>
    </Tooltip>
  );
}

function ExposureIcon({ type, message }: { type: string; message: string }): JSX.Element {
  const icon = type === 'discovered' ? '\u2315' : '\u26A1\uFE0E';
  return (
    <Tooltip content={message}>
      <span className="text-sm">{icon}</span>
    </Tooltip>
  );
}

function parseWarnings(configWarnings: string | null): Record<string, boolean> {
  if (!configWarnings) return {};
  try {
    const parsed = JSON.parse(configWarnings);
    if (!Array.isArray(parsed)) return {};
    return Object.fromEntries(parsed.map((w: string) => [w, true]));
  } catch {
    return {};
  }
}
