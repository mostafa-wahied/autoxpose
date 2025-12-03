import { TerminalServiceCard } from '../../components/terminal';
import { type ServiceRecord } from '../../lib/api';

interface ServiceGridProps {
  services: ServiceRecord[];
  activeServiceId: string | null;
  onExpose: (service: ServiceRecord) => void;
  onDelete: (service: ServiceRecord) => void;
  loadingServiceId: string | null;
}

export function ServiceGrid({
  services,
  activeServiceId,
  onExpose,
  onDelete,
  loadingServiceId,
}: ServiceGridProps): JSX.Element {
  if (services.length === 0) {
    return <EmptyServiceGrid />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {services.map(service => (
        <TerminalServiceCard
          key={service.id}
          service={service}
          isActive={activeServiceId === service.id}
          onExpose={() => onExpose(service)}
          onDelete={() => onDelete(service)}
          isLoading={loadingServiceId === service.id}
        />
      ))}
    </div>
  );
}

function EmptyServiceGrid(): JSX.Element {
  return (
    <div className="rounded border border-dashed border-[#30363d] p-8 text-center">
      <p className="text-[#8b949e]">No services discovered yet.</p>
      <p className="mt-2 text-xs text-[#484f58]">
        Click the yellow button to scan for Docker containers.
      </p>
    </div>
  );
}
