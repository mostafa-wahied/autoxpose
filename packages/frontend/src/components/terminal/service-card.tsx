import { useState } from 'react';
import { type ServiceRecord } from '../../lib/api';
import { EditableServiceName, EditableSubdomain } from './editable';
import { InlineSpinner } from './progress';
import { StatusBadge } from './service-card-status';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';
interface TerminalServiceCardProps {
  service: ServiceRecord;
  baseDomain: string | null;
  onExpose: () => void;
  onDelete: () => void;
  onSubdomainChange: (subdomain: string) => void;
  onNameChange: (name: string) => void;
  onRetrySsl: () => void;
  isLoading: boolean;
  isActive?: boolean;
  canExpose: boolean;
  canExposeBlockedReason?: string;
  isRetrySslPending?: boolean;
  scanTrigger?: number;
}
export function TerminalServiceCard(props: TerminalServiceCardProps): JSX.Element {
  const {
    service,
    baseDomain,
    onExpose,
    onDelete,
    onSubdomainChange,
    onNameChange,
    onRetrySsl,
    isLoading,
    isActive,
    canExposeBlockedReason,
    isRetrySslPending = false,
    scanTrigger,
  } = props;
  const [showDelete, setShowDelete] = useState(false);
  const [protocol, setProtocol] = useState<'https' | 'http' | null>(null);
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
        protocol={protocol}
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
        onRetrySsl={onRetrySsl}
        onProtocolChange={setProtocol}
        isRetrySslPending={isRetrySslPending}
        scanTrigger={scanTrigger}
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
  onRetrySsl: () => void;
  onProtocolChange: (protocol: 'https' | 'http' | null) => void;
  isRetrySslPending: boolean;
  scanTrigger?: number;
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
    onRetrySsl,
    onProtocolChange,
    isRetrySslPending,
    scanTrigger,
  } = props;
  return (
    <div className="flex items-center justify-between">
      <StatusBadge
        serviceId={serviceId}
        isExposed={isExposed}
        service={service}
        onProtocolChange={onProtocolChange}
        scanTrigger={scanTrigger}
      />
      <div className="flex items-center gap-2">
        {isExposed && service.sslPending && (
          <Tooltip content="Retry SSL certificate setup">
            <button
              onClick={onRetrySsl}
              disabled={isRetrySslPending}
              className="rounded border border-[#f0883e] px-2 py-1 text-xs transition-colors hover:bg-[#f0883e20] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              style={{ color: TERMINAL_COLORS.warning }}
            >
              {isRetrySslPending && <InlineSpinner />}
              Retry SSL
            </button>
          </Tooltip>
        )}
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
