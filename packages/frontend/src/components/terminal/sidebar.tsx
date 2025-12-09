import { type ServiceRecord } from '../../lib/api';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

interface TerminalSidebarProps {
  services: ServiceRecord[];
  activeServiceId?: string | null;
  onServiceClick?: (service: ServiceRecord) => void;
}

export function TerminalSidebar({
  services,
  activeServiceId,
  onServiceClick,
}: TerminalSidebarProps): JSX.Element {
  return (
    <div className="flex w-56 flex-col border-r border-[#1b1f29] bg-[#0b0d11]">
      <div className="flex-1 overflow-auto p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[#9aa0aa]">
          Services
        </div>
        <div className="space-y-0.5">
          {services.map(s => (
            <SidebarItem
              key={s.id}
              service={s}
              isActive={activeServiceId === s.id}
              onClick={() => onServiceClick?.(s)}
            />
          ))}
          {services.length === 0 && <EmptyState />}
        </div>
      </div>
    </div>
  );
}

interface SidebarItemProps {
  service: ServiceRecord;
  isActive: boolean;
  onClick: () => void;
}

function SidebarItem({ service, isActive, onClick }: SidebarItemProps): JSX.Element {
  const tipText = service.enabled ? 'Online - Click to view' : 'Offline';
  const activeCss = isActive
    ? 'bg-[#101218] text-[#e2e8f0]'
    : 'text-[#e2e8f0] opacity-70 hover:bg-[#101218] hover:opacity-100';
  const dotColor = service.enabled ? TERMINAL_COLORS.success : TERMINAL_COLORS.textMuted;

  return (
    <Tooltip content={tipText} side="right">
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${activeCss}`}
      >
        <span style={{ color: dotColor }}>{service.enabled ? '\u25CF' : '\u25CB'}</span>
        <span className="truncate">{service.name}</span>
      </button>
    </Tooltip>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="px-2 py-4 text-center text-xs text-[#8b949e]">
      No services yet.
      <br />
      Click the yellow button to scan.
    </div>
  );
}
