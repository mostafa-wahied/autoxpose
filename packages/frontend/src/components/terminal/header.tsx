import { useState } from 'react';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';
import { TrafficLightButton } from './traffic-light';
import { generateTopologyASCII, ServicesDisplay, TopologyNode } from './topology';

interface ServiceItem {
  id: string;
  name: string;
  subdomain: string;
  enabled: boolean;
}

interface TopologyVisualizationProps {
  dnsProvider?: string | null;
  proxyProvider?: string | null;
  services: ServiceItem[];
  dnsConfigured: boolean;
  proxyConfigured: boolean;
}

function TopologyVisualization({
  dnsProvider,
  proxyProvider,
  services,
  dnsConfigured,
  proxyConfigured,
}: TopologyVisualizationProps): JSX.Element {
  const exposedServices = services.filter(s => s.enabled);
  const bothConfigured = dnsConfigured && proxyConfigured;

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <TopologyNode emoji="docker" label="Docker" isDocker />

      <div className="text-[#30363d]">↓</div>
      <ServicesDisplay services={exposedServices} />

      <div className="text-[#30363d]">↓</div>

      <TopologyNode emoji="dns" label="DNS" configured={dnsConfigured} provider={dnsProvider} />

      <div className="text-[#30363d]">↓</div>

      <TopologyNode
        emoji="proxy"
        label="Proxy"
        configured={proxyConfigured}
        provider={proxyProvider}
      />

      <div className="text-[#30363d]">↓</div>

      <TopologyNode
        emoji="internet"
        label="Internet"
        isInternet
        bothConfigured={bothConfigured}
        statusText={bothConfigured ? 'Public' : 'Not exposed'}
      />
    </div>
  );
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

function TopologyPanel({
  isOpen,
  dnsProvider,
  proxyProvider,
  services,
  dnsConfigured,
  proxyConfigured,
}: {
  isOpen: boolean;
  dnsProvider?: string | null;
  proxyProvider?: string | null;
  services: ServiceItem[];
  dnsConfigured: boolean;
  proxyConfigured: boolean;
}): JSX.Element | null {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const exposedServices = services.filter(s => s.enabled);

  const handleCopy = async (): Promise<void> => {
    const ascii = generateTopologyASCII({
      services: exposedServices,
      dnsProvider,
      proxyProvider,
      dnsConfigured,
      proxyConfigured,
    });

    try {
      await navigator.clipboard.writeText(ascii);
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = ascii;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="absolute left-56 right-0 top-full z-50 border-b border-l border-r border-[#30363d] bg-[#161b22] shadow-lg">
      <div className="flex items-center justify-between border-b border-[#30363d] px-6 py-3">
        <div className="text-sm font-semibold text-[#c9d1d9]">Network Topology</div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 rounded border border-[#30363d] px-3 py-1 text-xs transition-colors hover:border-[#58a6ff] hover:text-[#58a6ff]"
        >
          <span>{copied ? '✓' : '📋'}</span>
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-6">
        <TopologyVisualization
          dnsProvider={dnsProvider}
          proxyProvider={proxyProvider}
          services={services}
          dnsConfigured={dnsConfigured}
          proxyConfigured={proxyConfigured}
        />
      </div>
    </div>
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
    </div>
  );
}
