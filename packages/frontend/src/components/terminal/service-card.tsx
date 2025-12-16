import { useEffect, useState } from 'react';
import { api, type ServiceRecord } from '../../lib/api';
import { EditableServiceName, EditableSubdomain } from './editable';
import { InlineSpinner } from './progress';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

interface TerminalServiceCardProps {
  service: ServiceRecord;
  baseDomain: string | null;
  onExpose: () => void;
  onDelete: () => void;
  onSubdomainChange: (subdomain: string) => void;
  onNameChange: (name: string) => void;
  isLoading: boolean;
  isActive?: boolean;
  canExpose: boolean;
  canExposeBlockedReason?: string;
}

export function TerminalServiceCard(props: TerminalServiceCardProps): JSX.Element {
  const {
    service,
    baseDomain,
    onExpose,
    onDelete,
    onSubdomainChange,
    onNameChange,
    isLoading,
    isActive,
    canExposeBlockedReason,
  } = props;
  const [showDelete, setShowDelete] = useState(false);
  const isExposed = Boolean(service.enabled);
  const borderClass = isActive ? 'border-[#58a6ff]' : 'border-[#30363d]';
  const canAct = props.canExpose || isExposed;

  return (
    <div
      className={`group relative border bg-[#161b22] p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg ${borderClass}`}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <CardHeader
        name={service.name}
        containerName={service.sourceId || service.name}
        port={service.port}
        scheme={service.scheme || 'http'}
        onNameChange={onNameChange}
      />
      <EditableSubdomain
        value={service.subdomain}
        baseDomain={baseDomain}
        isExposed={isExposed}
        onChange={onSubdomainChange}
      />
      <CardFooter
        service={service}
        serviceId={service.id}
        isExposed={isExposed}
        showDelete={showDelete}
        isLoading={isLoading}
        canAct={canAct}
        canExposeBlockedReason={canExposeBlockedReason}
        onExpose={onExpose}
        onDelete={onDelete}
      />
    </div>
  );
}

interface CardHeaderProps {
  name: string;
  containerName: string;
  port: number;
  scheme: string;
  onNameChange: (name: string) => void;
}

function CardHeader({
  name,
  containerName,
  port,
  scheme,
  onNameChange,
}: CardHeaderProps): JSX.Element {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        <EditableServiceName
          value={name}
          containerName={containerName}
          port={port}
          onChange={onNameChange}
        />
        <Tooltip content="Internal port">
          <span className="text-xs text-[#8b949e]">:{port}</span>
        </Tooltip>
      </div>
      <div className="mt-1">
        <span
          className="rounded px-2 py-0.5 text-xs font-medium"
          style={{
            background: scheme === 'https' ? '#3fb95020' : '#8b949e20',
            color: scheme === 'https' ? '#3fb950' : '#8b949e',
          }}
        >
          {(scheme || 'http').toUpperCase()}
        </span>
      </div>
    </div>
  );
}

interface CardFooterProps {
  service: ServiceRecord;
  serviceId: string;
  isExposed: boolean;
  showDelete: boolean;
  isLoading: boolean;
  canAct: boolean;
  canExposeBlockedReason?: string;
  onExpose: () => void;
  onDelete: () => void;
}

function CardFooter(props: CardFooterProps): JSX.Element {
  const {
    service,
    serviceId,
    isExposed,
    showDelete,
    isLoading,
    canAct,
    canExposeBlockedReason,
    onExpose,
    onDelete,
  } = props;
  return (
    <div className="flex items-center justify-between">
      <StatusBadge serviceId={serviceId} isExposed={isExposed} service={service} />
      <div className="flex items-center gap-2">
        <DeleteButton visible={showDelete} onClick={onDelete} />
        <ExposeButton
          isExposed={isExposed}
          isLoading={isLoading}
          canAct={canAct}
          canExposeBlockedReason={canExposeBlockedReason}
          onClick={onExpose}
        />
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  serviceId: string;
  isExposed: boolean;
  service: ServiceRecord;
}

function StatusBadge({ serviceId, isExposed, service }: StatusBadgeProps): JSX.Element {
  const [liveStatus, setLiveStatus] = useState<'checking' | 'online' | 'offline' | null>(null);

  useEffect(() => {
    if (!isExposed) {
      setLiveStatus(null);
      return;
    }
    setLiveStatus('checking');
    api.services
      .checkOnline(serviceId)
      .then(res => setLiveStatus(res.online ? 'online' : 'offline'))
      .catch(() => setLiveStatus('offline'));
  }, [serviceId, isExposed]);

  const warnings = parseWarnings(service.configWarnings);
  const showDnsWarning = isExposed && service.dnsExists === false;
  const showProxyWarning = isExposed && service.proxyExists === false;

  return (
    <div className="flex items-center gap-2">
      <StatusIndicator
        isExposed={isExposed}
        liveStatus={liveStatus}
        dnsExists={service.dnsExists}
        proxyExists={service.proxyExists}
      />
      {showDnsWarning && <WarningBadge type="DNS" message="DNS record missing" />}
      {showProxyWarning && <WarningBadge type="Proxy" message="Proxy host missing" />}
      {warnings.port_mismatch && <WarningBadge type="Port" message="Port mismatch detected" />}
      {warnings.scheme_mismatch && (
        <WarningBadge type="Scheme" message="Scheme mismatch detected" />
      )}
      {warnings.ip_mismatch && <WarningBadge type="IP" message="IP address mismatch detected" />}
      {service.exposureSource === 'discovered' && (
        <ExposureIcon type="discovered" message="Discovered existing configuration" />
      )}
      {service.exposureSource === 'auto' && (
        <ExposureIcon type="auto" message="Auto-exposed on discovery" />
      )}
    </div>
  );
}

function StatusIndicator({
  isExposed,
  liveStatus,
}: {
  isExposed: boolean;
  liveStatus: string | null;
  dnsExists: boolean | null;
  proxyExists: boolean | null;
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
  const icon = type === 'discovered' ? '\ud83d\udd0d' : '\u26a1';
  return (
    <Tooltip content={message}>
      <span className="text-sm">{icon}</span>
    </Tooltip>
  );
}

function parseWarnings(configWarnings: string | null): Record<string, boolean> {
  if (!configWarnings) return {};
  try {
    const warnings = JSON.parse(configWarnings) as string[];
    return warnings.reduce((acc, w) => ({ ...acc, [w]: true }), {} as Record<string, boolean>);
  } catch {
    return {};
  }
}

function DeleteButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}): JSX.Element {
  const opacityClass = visible ? 'opacity-100' : 'opacity-0';
  return (
    <div className={`transition-opacity duration-200 ${opacityClass}`}>
      <Tooltip content="Remove service">
        <button
          onClick={e => {
            e.stopPropagation();
            onClick();
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-[#8b949e] transition-colors hover:bg-[#f8514920] hover:text-[#f85149]"
          aria-label="Delete service"
        >
          x
        </button>
      </Tooltip>
    </div>
  );
}

interface ExposeButtonProps {
  isExposed: boolean;
  isLoading: boolean;
  canAct: boolean;
  canExposeBlockedReason?: string;
  onClick: () => void;
}

function ExposeButton({
  isExposed,
  isLoading,
  canAct,
  canExposeBlockedReason,
  onClick,
}: ExposeButtonProps): JSX.Element {
  const disabled = isLoading || !canAct;
  const tip = getTip(isExposed, canAct, canExposeBlockedReason);
  const icon = isExposed ? '\u25A0' : '\u25B6';
  const label = isExposed ? 'Stop service' : 'Start service';

  return (
    <Tooltip content={tip}>
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex h-7 w-7 items-center justify-center rounded border border-[#30363d] text-sm transition-all hover:border-[#58a6ff] hover:bg-[#58a6ff20] disabled:cursor-not-allowed disabled:opacity-50"
        style={{ color: TERMINAL_COLORS.accent }}
        aria-label={label}
      >
        {isLoading ? <InlineSpinner /> : icon}
      </button>
    </Tooltip>
  );
}

function getTip(isExposed: boolean, canAct: boolean, canExposeBlockedReason?: string): string {
  if (!canAct) return canExposeBlockedReason || 'Set subdomain and configure DNS/Proxy first';
  return isExposed ? 'Unexpose service' : 'Expose service';
}
