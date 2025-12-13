import { useState } from 'react';

interface ServiceItem {
  id: string;
  name: string;
  subdomain: string;
  enabled: boolean;
}

interface ServicesDisplayProps {
  services: ServiceItem[];
}

export function ServicesDisplay({ services }: ServicesDisplayProps): JSX.Element | null {
  const [servicesExpanded, setServicesExpanded] = useState(false);
  const serviceCount = services.length;

  if (serviceCount === 0) {
    return (
      <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-4 py-2 text-center text-sm text-[#8b949e]">
        No Services Exposed
      </div>
    );
  }

  if (serviceCount <= 3) {
    return (
      <div className="flex flex-row justify-center gap-3">
        {services.map(service => (
          <div
            key={service.id}
            className="flex-1 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-center text-xs"
          >
            <div className="truncate font-mono text-[#58a6ff]">{service.name}</div>
            <div className="truncate text-[#8b949e]">{service.subdomain}</div>
          </div>
        ))}
      </div>
    );
  }

  if (!servicesExpanded) {
    return (
      <button
        onClick={() => setServicesExpanded(true)}
        className="rounded-lg border border-[#30363d] bg-[#0d1117] px-4 py-2 text-sm transition-colors hover:border-[#3fb950]"
      >
        <div className="font-mono text-[#58a6ff]">{serviceCount} Services</div>
        <div className="text-xs text-[#8b949e]">▼ Click to expand</div>
      </button>
    );
  }

  const displayServices = serviceCount <= 6 ? services : services.slice(0, 6);
  const hasMore = serviceCount > 6;

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setServicesExpanded(false)}
        className="self-center text-xs text-[#8b949e] hover:text-[#58a6ff]"
      >
        ▲ Collapse
      </button>
      <div className="grid grid-cols-3 gap-3">
        {displayServices.map(service => (
          <div
            key={service.id}
            className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-center text-xs"
          >
            <div className="truncate font-mono text-[#58a6ff]">{service.name}</div>
            <div className="truncate text-[#8b949e]">{service.subdomain}</div>
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="text-center text-xs text-[#8b949e]">+{serviceCount - 6} more services</div>
      )}
    </div>
  );
}
