import { TerminalServiceCard } from '../../components/terminal';
import { type ServiceRecord } from '../../lib/api';

interface ServiceGridProps {
  services: ServiceRecord[];
  activeServiceId: string | null;
  onExpose: (service: ServiceRecord) => void;
  onDelete: (service: ServiceRecord) => void;
  onSubdomainChange: (service: ServiceRecord, subdomain: string) => void;
  loadingServiceId: string | null;
  baseDomain: string | null;
  canExpose: boolean;
}

export function ServiceGrid({
  services,
  activeServiceId,
  onExpose,
  onDelete,
  onSubdomainChange,
  loadingServiceId,
  baseDomain,
  canExpose,
}: ServiceGridProps): JSX.Element {
  if (services.length === 0) {
    return <EmptyServiceGrid />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {services.map(service => {
        const serviceReady = canExpose && Boolean(service.subdomain);
        return (
          <TerminalServiceCard
            key={service.id}
            service={service}
            baseDomain={baseDomain}
            isActive={activeServiceId === service.id}
            onExpose={() => onExpose(service)}
            onDelete={() => onDelete(service)}
            onSubdomainChange={sub => onSubdomainChange(service, sub)}
            isLoading={loadingServiceId === service.id}
            canExpose={serviceReady}
          />
        );
      })}
    </div>
  );
}

function EmptyServiceGrid(): JSX.Element {
  return (
    <div className="rounded border border-dashed border-[#30363d] p-8 text-center">
      <div className="mb-4 text-4xl text-[#484f58]">{'\u2699'}</div>
      <p className="text-[#8b949e]">No services discovered yet.</p>
      <p className="mt-2 text-sm text-[#8b949e]">
        Add <code className="rounded bg-[#21262d] px-1 text-[#f0883e]">autoxpose.enable=true</code>{' '}
        to your container labels
      </p>
      <p className="mt-4 text-xs text-[#58a6ff]">
        {'\u25CF'} Click the yellow button above to scan for containers
      </p>
    </div>
  );
}
