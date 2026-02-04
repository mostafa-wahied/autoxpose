import { useEffect } from 'react';
import { TerminalServiceCard } from '../../components/terminal';
import { useBulkStatusCheck } from '../../hooks/use-bulk-status-check';
import { type ServiceRecord } from '../../lib/api';

interface ServiceGridProps {
  services: ServiceRecord[];
  activeServiceId: string | null;
  onExpose: (service: ServiceRecord) => void;
  onDelete: (service: ServiceRecord) => void;
  onSubdomainChange: (service: ServiceRecord, subdomain: string) => void;
  onNameChange: (service: ServiceRecord, name: string) => void;
  onRetrySsl: (service: ServiceRecord) => void;
  loadingServiceId: string | null;
  baseDomain: string | null;
  canExpose: boolean;
  canExposeReason?: string;
  onScan: () => void;
  retrySslPending: boolean;
  scanTrigger: number;
  isWildcardMode: boolean;
}

export function ServiceGrid({
  services,
  activeServiceId,
  onExpose,
  onDelete,
  onSubdomainChange,
  onNameChange,
  onRetrySsl,
  loadingServiceId,
  baseDomain,
  canExpose,
  canExposeReason,
  onScan,
  retrySslPending,
  scanTrigger,
  isWildcardMode,
}: ServiceGridProps): JSX.Element {
  const { statusMap, checkServices } = useBulkStatusCheck(scanTrigger);

  useEffect(() => {
    checkServices(services);
  }, [services, checkServices]);

  if (services.length === 0) {
    return <EmptyServiceGrid onScan={onScan} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {services.map(service => {
        const serviceReady = canExpose && Boolean(service.subdomain);
        const blockedReason = !canExpose
          ? canExposeReason
          : !service.subdomain
            ? 'Set subdomain first'
            : undefined;
        return (
          <TerminalServiceCard
            key={service.id}
            service={service}
            baseDomain={baseDomain}
            isActive={activeServiceId === service.id}
            onExpose={() => onExpose(service)}
            onDelete={() => onDelete(service)}
            onSubdomainChange={sub => onSubdomainChange(service, sub)}
            onNameChange={name => onNameChange(service, name)}
            onRetrySsl={() => onRetrySsl(service)}
            isLoading={loadingServiceId === service.id}
            canExpose={serviceReady}
            canExposeBlockedReason={!serviceReady ? blockedReason : undefined}
            isRetrySslPending={retrySslPending}
            scanTrigger={scanTrigger}
            bulkStatus={statusMap[service.id]}
            isWildcardMode={isWildcardMode}
          />
        );
      })}
    </div>
  );
}

interface EmptyServiceGridProps {
  onScan: () => void;
}

function EmptyServiceGrid({ onScan }: EmptyServiceGridProps): JSX.Element {
  return (
    <div className="rounded border border-dashed border-[#30363d] p-8 text-center">
      <div className="mb-4 text-4xl text-[#484f58]">{'\u2699'}</div>
      <p className="text-[#8b949e]">No services discovered yet.</p>
      <p className="mt-2 text-sm text-[#8b949e]">
        Add <code className="rounded bg-[#21262d] px-1 text-[#f0883e]">autoxpose.enable=true</code>{' '}
        to your container labels
      </p>
      <button
        onClick={onScan}
        className="mt-6 rounded bg-yellow-500 px-6 py-2 text-sm font-semibold text-black transition-all hover:bg-yellow-400 hover:scale-105"
      >
        ↻ Scan for Containers
      </button>
    </div>
  );
}
