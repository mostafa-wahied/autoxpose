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
      <div className="rounded border border-[#30363d] bg-[#161b22] px-4 py-2 text-center text-sm text-[#8b949e]">
        No Services Exposed
      </div>
    );
  }

  if (serviceCount <= 3) {
    return (
      <div className="flex flex-col gap-2">
        {services.map(service => (
          <div
            key={service.id}
            className="rounded border border-[#30363d] bg-[#161b22] px-3 py-1 text-xs"
          >
            <div className="font-mono text-[#58a6ff]">{service.name}</div>
            <div className="text-[#8b949e]">{service.subdomain}</div>
          </div>
        ))}
      </div>
    );
  }

  if (!servicesExpanded) {
    return (
      <button
        onClick={() => setServicesExpanded(true)}
        className="rounded border border-[#30363d] bg-[#161b22] px-4 py-2 text-sm transition-colors hover:border-[#58a6ff]"
      >
        <div className="font-mono text-[#58a6ff]">{serviceCount} Services</div>
        <div className="text-xs text-[#8b949e]">▼ Click to expand</div>
      </button>
    );
  }

  const displayServices = serviceCount <= 6 ? services : services.slice(0, 4);
  const hasMore = serviceCount > 6;

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setServicesExpanded(false)}
        className="self-center text-xs text-[#8b949e] hover:text-[#58a6ff]"
      >
        ▲ Collapse
      </button>
      {displayServices.map(service => (
        <div
          key={service.id}
          className="rounded border border-[#30363d] bg-[#161b22] px-3 py-1 text-xs"
        >
          <div className="font-mono text-[#58a6ff]">{service.name}</div>
          <div className="text-[#8b949e]">{service.subdomain}</div>
        </div>
      ))}
      {hasMore && (
        <div className="text-center text-xs text-[#8b949e]">+{serviceCount - 4} more services</div>
      )}
    </div>
  );
}
