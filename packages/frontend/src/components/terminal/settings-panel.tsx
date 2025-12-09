import { type SettingsStatus } from '../../lib/api';
import { DnsConfigSection } from './dns-config';
import { ProxyConfigSection } from './proxy-config';

interface SettingsPanelProps {
  settings: SettingsStatus | null | undefined;
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ settings, isOpen, onClose }: SettingsPanelProps): JSX.Element {
  const visClass = isOpen ? 'max-h-[60vh] opacity-100' : 'max-h-0 opacity-0';

  return (
    <div
      className={`overflow-y-auto border-t border-[#1b1f29] bg-[#0b0d11] transition-all duration-300 ease-in-out ${visClass}`}
    >
      <div className="p-6 pb-8">
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
      <h3 className="text-sm font-bold text-[#e2e8f0]">Configuration</h3>
      <button
        onClick={onClose}
        className="text-xs text-[#9aa0aa] transition-colors hover:text-[#e2e8f0]"
      >
        Close
      </button>
    </div>
  );
}
