import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';
import { TrafficLightButton } from './traffic-light';

interface TerminalHeaderProps {
  serviceCount: number;
  exposedCount: number;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  serverName?: string;
  onExposeAll: () => void;
  onUnexposeAll: () => void;
  onScan: () => void;
  isScanning?: boolean;
  canExpose: boolean;
}

function getStatusInfo(status: TerminalHeaderProps['connectionStatus']): [string, string] {
  if (status === 'connected') return [TERMINAL_COLORS.success, 'Connected'];
  if (status === 'connecting') return [TERMINAL_COLORS.warning, 'Connecting...'];
  return [TERMINAL_COLORS.error, 'Disconnected'];
}

interface TrafficLightsProps {
  onUnexposeAll: () => void;
  onScan: () => void;
  onExposeAll: () => void;
  exposedCount: number;
  serviceCount: number;
  isScanning?: boolean;
  canExpose: boolean;
}

function TrafficLights(p: TrafficLightsProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <TrafficLightButton
        color="red"
        tooltip="Unexpose all"
        shortcut="Ctrl+Alt+U"
        onClick={p.onUnexposeAll}
        disabled={p.exposedCount === 0}
      />
      <TrafficLightButton
        color="yellow"
        tooltip="Scan containers"
        shortcut="Ctrl+Alt+S"
        onClick={p.onScan}
        disabled={p.isScanning}
      />
      <TrafficLightButton
        color="green"
        tooltip="Expose all"
        shortcut="Ctrl+Alt+E"
        onClick={p.onExposeAll}
        disabled={p.serviceCount === 0 || p.exposedCount === p.serviceCount || !p.canExpose}
      />
    </div>
  );
}

export function TerminalHeader(props: TerminalHeaderProps): JSX.Element {
  const { serviceCount, exposedCount, connectionStatus, serverName = 'localhost' } = props;
  const [statusColor, statusText] = getStatusInfo(connectionStatus);
  const pulseClass = connectionStatus === 'connected' ? 'animate-pulse' : '';
  const svcLabel = serviceCount === 1 ? 'service' : 'services';
  const handleLogoClick = (): void => {
    window.location.href = '/';
  };

  return (
    <div className="flex items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4 py-2">
      <div className="flex items-center gap-3">
        <TrafficLights
          onUnexposeAll={props.onUnexposeAll}
          onScan={props.onScan}
          onExposeAll={props.onExposeAll}
          exposedCount={exposedCount}
          serviceCount={serviceCount}
          isScanning={props.isScanning}
          canExpose={props.canExpose}
        />
        <button
          type="button"
          onClick={handleLogoClick}
          className="ml-2 font-bold text-[#c9d1d9] hover:text-white focus:outline-none"
        >
          autoxpose
        </button>
        <span className="text-xs text-[#8b949e]">
          {serviceCount} {svcLabel} | {exposedCount} exposed
        </span>
      </div>
      <Tooltip content={`${statusText} to ${serverName}`}>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${pulseClass}`}
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-[#8b949e]">{serverName}</span>
        </div>
      </Tooltip>
    </div>
  );
}
