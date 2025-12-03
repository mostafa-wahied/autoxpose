import { type SettingsStatus } from '../../lib/api';
import { DnsConfigSection } from './dns-config';
import { ProxyConfigSection } from './proxy-config';

interface SettingsPanelProps {
  settings: SettingsStatus | null | undefined;
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ settings, isOpen, onClose }: SettingsPanelProps): JSX.Element {
  const visClass = isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0';

  return (
    <div
      className={`overflow-hidden border-t border-[#30363d] bg-[#0d1117] transition-all duration-300 ease-in-out ${visClass}`}
    >
      <div className="p-6">
        <PanelHeader onClose={onClose} />
        <div className="grid gap-6 md:grid-cols-2">
          <DnsConfigSection current={settings?.dns ?? null} />
          <ProxyConfigSection current={settings?.proxy ?? null} />
        </div>
      </div>
    </div>
  );
}

function PanelHeader({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-sm font-bold text-[#c9d1d9]">Configuration</h3>
      <button
        onClick={onClose}
        className="text-xs text-[#8b949e] transition-colors hover:text-[#c9d1d9]"
      >
        Close
      </button>
    </div>
  );
}
