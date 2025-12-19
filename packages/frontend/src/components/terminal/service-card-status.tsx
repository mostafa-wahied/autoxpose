import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ServiceRecord } from '../../lib/api';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

interface StatusBadgeProps {
  serviceId: string;
  isExposed: boolean;
  service: ServiceRecord;
  onProtocolChange: (protocol: 'https' | 'http' | null) => void;
  scanTrigger?: number;
  bulkStatus?: { online: boolean; protocol: string | null };
}

export function StatusBadge({
  serviceId,
  isExposed,
  service,
  onProtocolChange,
  scanTrigger,
  bulkStatus,
}: StatusBadgeProps): JSX.Element {
  const [liveStatus, setLiveStatus] = useState<'checking' | 'online' | 'offline' | null>(null);
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.services.sync(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  useEffect(() => {
    if (!isExposed) {
      setLiveStatus(null);
      onProtocolChange(null);
      return;
    }

    if (bulkStatus) {
      const isOnline = bulkStatus.online;
      setLiveStatus(isOnline ? 'online' : 'offline');
      onProtocolChange(
        bulkStatus.protocol === 'https' || bulkStatus.protocol === 'http'
          ? bulkStatus.protocol
          : null
      );

      if (!isOnline && !service.configWarnings && !syncMutation.isPending) {
        syncMutation.mutate(serviceId);
      }
    } else {
      setLiveStatus('checking');
    }
  }, [
    serviceId,
    isExposed,
    onProtocolChange,
    scanTrigger,
    bulkStatus,
    service.configWarnings,
    syncMutation,
  ]);

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

  const badges = buildWarningBadges(warnings, showUnreachableReasons, service);
  const icons = buildExposureIcons(service);

  return (
    <>
      {badges.map((w, i) => w.show && <WarningBadge key={i} type={w.type} message={w.msg} />)}
      <FixConfigButton service={service} warnings={warnings} />
      {icons.map((ic, i) => ic.show && <ExposureIcon key={i} type={ic.type} message={ic.msg} />)}
    </>
  );
}

function FixConfigButton({
  service,
  warnings,
}: {
  service: ServiceRecord;
  warnings: ReturnType<typeof parseWarnings>;
}): JSX.Element | null {
  const queryClient = useQueryClient();
  const fixMutation = useMutation({
    mutationFn: (id: string) => api.services.fixConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  const hasFixable = warnings.port_mismatch || warnings.ip_mismatch;
  if (!hasFixable) return null;

  return (
    <button
      onClick={() => fixMutation.mutate(service.id)}
      disabled={fixMutation.isPending}
      className="px-2 py-0.5 text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-700/50 rounded hover:bg-yellow-900/50 disabled:opacity-50"
      title="Fix configuration mismatch automatically"
    >
      {fixMutation.isPending ? 'Fixing...' : 'Fix'}
    </button>
  );
}

function buildWarningBadges(
  warnings: ReturnType<typeof parseWarnings>,
  showUnreachableReasons: boolean,
  service: ServiceRecord
): Array<{ show: boolean; type: string; msg: string }> {
  return [
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
}

function buildExposureIcons(
  service: ServiceRecord
): Array<{ show: boolean; type: string; msg: string }> {
  return [
    {
      show: service.exposureSource === 'discovered',
      type: 'discovered',
      msg: 'Discovered existing configuration',
    },
    { show: service.exposureSource === 'auto', type: 'auto', msg: 'Auto-exposed on discovery' },
  ];
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
