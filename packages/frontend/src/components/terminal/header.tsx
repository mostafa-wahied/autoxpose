import { useState } from 'react';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';
import { TrafficLightButton } from './traffic-light';
import { TopologyPanel } from './topology-panel';
import { usePlatform } from '../../hooks/use-platform';
import { useTagPreferences } from '../../hooks/use-tag-preferences';

interface ServiceItem {
  id: string;
  name: string;
  subdomain: string;
  enabled: boolean;
}

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
  dnsProvider?: string | null;
  proxyProvider?: string | null;
  services?: ServiceItem[];
  dnsConfigured?: boolean;
  proxyConfigured?: boolean;
  onHelp: () => void;
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
  const { modKey, altKey } = usePlatform();

  return (
    <div className="flex items-center gap-2">
      <TrafficLightButton
        color="red"
        tooltip="Unexpose all"
        shortcut={`${modKey}+${altKey}+U`}
        onClick={p.onUnexposeAll}
        disabled={p.exposedCount === 0}
      />
      <TrafficLightButton
        color="yellow"
        tooltip="Scan containers"
        shortcut={`${modKey}+${altKey}+S`}
        onClick={p.onScan}
        disabled={p.isScanning}
      />
      <TrafficLightButton
        color="green"
        tooltip="Expose all"
        shortcut={`${modKey}+${altKey}+E`}
        onClick={p.onExposeAll}
        disabled={p.serviceCount === 0 || p.exposedCount === p.serviceCount || !p.canExpose}
      />
    </div>
  );
}

function ServerStatus({
  statusColor,
  statusText,
  serverName,
  pulseClass,
}: {
  statusColor: string;
  statusText: string;
  serverName: string;
  pulseClass: string;
}): JSX.Element {
  return (
    <Tooltip content={`${statusText} to ${serverName}`}>
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${pulseClass}`}
          style={{ backgroundColor: statusColor }}
        />
        <span className="text-[#8b949e]">{serverName}</span>
      </div>
    </Tooltip>
  );
}

export function TerminalHeader(props: TerminalHeaderProps): JSX.Element {
  const {
    serviceCount,
    exposedCount,
    connectionStatus,
    serverName = 'localhost',
    services = [],
    dnsProvider,
    proxyProvider,
    dnsConfigured = false,
    proxyConfigured = false,
  } = props;
  const [statusColor, statusText] = getStatusInfo(connectionStatus);
  const [topologyOpen, setTopologyOpen] = useState(false);
  const pulseClass = connectionStatus === 'connected' ? 'animate-pulse' : '';
  const svcLabel = serviceCount === 1 ? 'service' : 'services';
  const handleLogoClick = (): void => {
    window.location.href = '/';
  };

  return (
    <div className="relative flex items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4 py-2">
      <HeaderLeftSection
        {...props}
        serviceCount={serviceCount}
        svcLabel={svcLabel}
        exposedCount={exposedCount}
        topologyOpen={topologyOpen}
        onTopologyToggle={() => setTopologyOpen(!topologyOpen)}
        onLogoClick={handleLogoClick}
      />
      <ServerStatus
        statusColor={statusColor}
        statusText={statusText}
        serverName={serverName}
        pulseClass={pulseClass}
      />

      <TopologyPanel
        isOpen={topologyOpen}
        onClose={() => setTopologyOpen(false)}
        dnsProvider={dnsProvider}
        proxyProvider={proxyProvider}
        services={services}
        dnsConfigured={dnsConfigured}
        proxyConfigured={proxyConfigured}
      />
    </div>
  );
}

interface HeaderLeftSectionProps extends TerminalHeaderProps {
  serviceCount: number;
  svcLabel: string;
  exposedCount: number;
  topologyOpen: boolean;
  onTopologyToggle: () => void;
  onLogoClick: () => void;
}

function HeaderLeftSection(props: HeaderLeftSectionProps): JSX.Element {
  const { showTags, setShowTags } = useTagPreferences();

  return (
    <div className="flex items-center gap-3">
      <TrafficLights
        onUnexposeAll={props.onUnexposeAll}
        onScan={props.onScan}
        onExposeAll={props.onExposeAll}
        exposedCount={props.exposedCount}
        serviceCount={props.serviceCount}
        isScanning={props.isScanning}
        canExpose={props.canExpose}
      />
      <button
        type="button"
        onClick={props.onLogoClick}
        className="ml-2 font-bold text-[#c9d1d9] hover:text-white focus:outline-none"
      >
        autoxpose
      </button>
      <span className="text-xs text-[#8b949e]">
        {props.serviceCount} {props.svcLabel} | {props.exposedCount} exposed
      </span>
      <Tooltip content="Network Topology">
        <button
          type="button"
          onClick={props.onTopologyToggle}
          className={`ml-2 rounded border px-2 py-1 text-xs transition-colors ${
            props.topologyOpen
              ? 'border-[#58a6ff] bg-[#388bfd1a] text-[#58a6ff]'
              : 'border-[#30363d] bg-[#21262d] text-[#8b949e] hover:border-[#58a6ff] hover:bg-[#30363d] hover:text-[#c9d1d9]'
          }`}
        >
          ∴
        </button>
      </Tooltip>
      <Tooltip content={showTags ? 'Hide tags' : 'Show tags'}>
        <button
          type="button"
          onClick={() => setShowTags(!showTags)}
          className={`rounded border px-2 py-1 text-xs transition-colors ${
            showTags
              ? 'border-[#58a6ff] bg-[#388bfd1a] text-[#58a6ff]'
              : 'border-[#30363d] bg-[#21262d] text-[#8b949e] hover:border-[#58a6ff] hover:bg-[#30363d] hover:text-[#c9d1d9]'
          }`}
        >
          #
        </button>
      </Tooltip>
    </div>
  );
}
