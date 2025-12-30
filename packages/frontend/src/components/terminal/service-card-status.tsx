import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ServiceRecord } from '../../lib/api';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';
import { SubdomainDialog } from './subdomain-dialog';

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
  const exposureIcons = [
    service.exposureSource === 'discovered' && {
      type: 'discovered',
      msg: 'Discovered existing configuration',
    },
    service.exposureSource === 'auto' && { type: 'auto', msg: 'Auto-exposed on discovery' },
  ].filter(Boolean) as Array<{ type: string; msg: string }>;

  return (
    <>
      {badges.map((w, i) => w.show && <WarningBadge key={i} type={w.type} message={w.msg} />)}
      <MigrateSubdomainButton service={service} warnings={warnings} />
      <PartialExposureButtons service={service} showUnreachableReasons={showUnreachableReasons} />
      {exposureIcons.map((ic, i) => (
        <ExposureIcon key={i} type={ic.type} message={ic.msg} />
      ))}
    </>
  );
}

function MigrateSubdomainButton({
  service,
  warnings,
}: {
  service: ServiceRecord;
  warnings: ReturnType<typeof parseWarnings>;
}): JSX.Element | null {
  const [showDialog, setShowDialog] = useState(false);

  if (!warnings.subdomain_mismatch) return null;

  return (
    <>
      <Tooltip content="Resolve subdomain conflict. Choose which subdomain to keep.">
        <button
          onClick={() => setShowDialog(true)}
          className="px-2 py-0.5 text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-700/50 rounded hover:bg-yellow-900/50"
        >
          Resolve
        </button>
      </Tooltip>
      {showDialog && <SubdomainDialog service={service} onClose={() => setShowDialog(false)} />}
    </>
  );
}

function PartialExposureButtons({
  service,
}: {
  service: ServiceRecord;
  showUnreachableReasons: boolean;
}): JSX.Element | null {
  const queryClient = useQueryClient();

  const dnsOnlyMutation = useMutation({
    mutationFn: (id: string) => api.services.exposeDnsOnly(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });

  const proxyOnlyMutation = useMutation({
    mutationFn: (id: string) => api.services.exposeProxyOnly(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });

  const hasMismatch = service.dnsExists !== service.proxyExists;
  const showDnsButton = hasMismatch && service.proxyExists && !service.dnsExists;
  const showProxyButton = hasMismatch && service.dnsExists && !service.proxyExists;

  if (!showDnsButton && !showProxyButton) return null;

  return (
    <>
      {showDnsButton && (
        <PartialButton
          onClick={() => dnsOnlyMutation.mutate(service.id)}
          isPending={dnsOnlyMutation.isPending}
          label="Create DNS"
          title="Create DNS record for this service"
        />
      )}
      {showProxyButton && (
        <PartialButton
          onClick={() => proxyOnlyMutation.mutate(service.id)}
          isPending={proxyOnlyMutation.isPending}
          label="Create Proxy"
          title="Create proxy host for this service"
        />
      )}
    </>
  );
}

function PartialButton({
  onClick,
  isPending,
  label,
  title,
}: {
  onClick: () => void;
  isPending: boolean;
  label: string;
  title: string;
}): JSX.Element {
  return (
    <Tooltip content={title}>
      <button
        onClick={onClick}
        disabled={isPending}
        className="px-2 py-0.5 text-xs bg-red-900/30 text-red-400 border border-red-700/50 rounded hover:bg-red-900/50 disabled:opacity-50"
      >
        {isPending ? 'Creating...' : label}
      </button>
    </Tooltip>
  );
}

function calculatePropagationState(service: ServiceRecord): {
  isPropagating: boolean;
  hideUnreachable: boolean;
} {
  const recentlyExposed = service.updatedAt
    ? Date.now() - new Date(service.updatedAt).getTime() < 30000
    : false;
  const isUnreachable = service.reachabilityStatus === 'unreachable';
  const isPropagating =
    Boolean(service.enabled) && recentlyExposed && !service.lastReachabilityCheck && isUnreachable;
  return { isPropagating, hideUnreachable: isPropagating };
}

function isLocalDnsLag(service: ServiceRecord, showUnreachableReasons: boolean): boolean {
  if (!showUnreachableReasons) return false;
  const properlyConfigured =
    Boolean(service.enabled) &&
    service.dnsExists === true &&
    service.proxyExists === true &&
    (!service.configWarnings || service.configWarnings === '[]');
  const isUnreachable = service.reachabilityStatus === 'unreachable';
  const recentlyConfigured = service.updatedAt
    ? Date.now() - new Date(service.updatedAt).getTime() < 300000
    : false;
  const { isPropagating } = calculatePropagationState(service);
  return properlyConfigured && isUnreachable && recentlyConfigured && !isPropagating;
}

function buildWarningBadges(
  warnings: ReturnType<typeof parseWarnings>,
  showUnreachableReasons: boolean,
  service: ServiceRecord
): Array<{ show: boolean; type: string; msg: string }> {
  const hasMismatch = service.dnsExists !== service.proxyExists;
  const { isPropagating, hideUnreachable } = calculatePropagationState(service);
  const shouldHide = hideUnreachable && showUnreachableReasons;
  const localDnsLag = isLocalDnsLag(service, showUnreachableReasons);

  return [
    { show: isPropagating, type: 'Propagating', msg: 'DNS propagating, please wait' },
    {
      show: localDnsLag,
      type: 'Local DNS',
      msg: 'May work externally. Local DNS cache needs time to update.',
    },
    {
      show: hasMismatch && service.dnsExists === false && service.proxyExists === true,
      type: 'DNS',
      msg: 'DNS record missing',
    },
    {
      show: hasMismatch && service.proxyExists === false && service.dnsExists === true,
      type: 'Proxy',
      msg: 'Proxy host missing',
    },
    {
      show: showUnreachableReasons && !shouldHide && service.dnsExists === null,
      type: 'DNS?',
      msg: 'DNS status unknown',
    },
    {
      show: showUnreachableReasons && !shouldHide && service.proxyExists === null,
      type: 'Proxy?',
      msg: 'DNS status unknown',
    },
    { show: warnings.port_mismatch, type: 'Port', msg: 'Port mismatch detected' },
    { show: warnings.scheme_mismatch, type: 'Scheme', msg: 'Scheme mismatch detected' },
    { show: warnings.ip_mismatch, type: 'IP', msg: 'IP address mismatch detected' },
    {
      show: warnings.subdomain_mismatch,
      type: 'Subdomain',
      msg: `Exposed as ${service.exposedSubdomain}, label says ${service.subdomain}`,
    },
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
