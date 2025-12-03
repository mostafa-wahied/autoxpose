import { type SettingsStatus } from '../../lib/api';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

interface SettingsStatusBarProps {
  settings: SettingsStatus | null | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}

export function SettingsStatusBar({
  settings,
  isExpanded,
  onToggle,
}: SettingsStatusBarProps): JSX.Element {
  return (
    <div className="border-t border-[#30363d] bg-[#161b22] px-4 py-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <DnsStatusIndicator settings={settings} />
          <span className="text-[#30363d]">|</span>
          <ProxyStatusIndicator settings={settings} />
        </div>
        <ConfigureButton isExpanded={isExpanded} onClick={onToggle} />
      </div>
    </div>
  );
}

function DnsStatusIndicator({
  settings,
}: {
  settings: SettingsStatus | null | undefined;
}): JSX.Element {
  const configured = settings?.dns?.configured ?? false;
  const provider = settings?.dns?.provider ?? 'none';
  const tip = configured ? `Provider: ${provider}` : 'DNS not configured';
  const color = configured ? TERMINAL_COLORS.success : TERMINAL_COLORS.textMuted;

  return (
    <Tooltip content={tip}>
      <div className="flex items-center gap-1.5">
        <span className="text-[#8b949e]">DNS:</span>
        <span style={{ color }}>{configured ? '\u2713' : '\u25CB'}</span>
        {configured && <span className="text-[#8b949e]">{provider}</span>}
      </div>
    </Tooltip>
  );
}

function ProxyStatusIndicator({
  settings,
}: {
  settings: SettingsStatus | null | undefined;
}): JSX.Element {
  const configured = settings?.proxy?.configured ?? false;
  const provider = settings?.proxy?.provider ?? 'none';
  const url = settings?.proxy?.config?.url ?? '';
  const tip = configured ? `${provider} @ ${url}` : 'Proxy not configured';
  const color = configured ? TERMINAL_COLORS.success : TERMINAL_COLORS.textMuted;

  return (
    <Tooltip content={tip}>
      <div className="flex items-center gap-1.5">
        <span className="text-[#8b949e]">Proxy:</span>
        <span style={{ color }}>{configured ? '\u2713' : '\u25CB'}</span>
        {configured && <span className="text-[#8b949e]">{provider}</span>}
      </div>
    </Tooltip>
  );
}

interface ConfigureButtonProps {
  isExpanded: boolean;
  onClick: () => void;
}

function ConfigureButton({ isExpanded, onClick }: ConfigureButtonProps): JSX.Element {
  const arrow = isExpanded ? '\u25BC' : '\u25B2';

  return (
    <Tooltip content={isExpanded ? 'Close settings' : 'Open settings panel'} shortcut="Ctrl+,">
      <button
        onClick={onClick}
        className="flex items-center gap-1 rounded px-2 py-1 text-[#8b949e] transition-colors hover:bg-[#30363d] hover:text-[#c9d1d9]"
      >
        <span>Configure</span>
        <span className="text-[10px]">{arrow}</span>
      </button>
    </Tooltip>
  );
}
