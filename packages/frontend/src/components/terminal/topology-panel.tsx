import { useState, useEffect } from 'react';
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

      <div className="text-[#6e7681] text-lg">↓</div>
      <ServicesDisplay services={exposedServices} />

      <div className="text-[#6e7681] text-lg">↓</div>

      <TopologyNode emoji="dns" label="DNS" configured={dnsConfigured} provider={dnsProvider} />

      <div className="text-[#6e7681] text-lg">↓</div>

      <TopologyNode
        emoji="proxy"
        label="Proxy"
        configured={proxyConfigured}
        provider={proxyProvider}
      />

      <div className="text-[#6e7681] text-lg">↓</div>

      <TopologyNode
        emoji="internet"
        label="Internet"
        isInternet
        bothConfigured={bothConfigured}
        statusText={bothConfigured ? '✓' : '✗'}
      />
    </div>
  );
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

interface TopologyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  dnsProvider?: string | null;
  proxyProvider?: string | null;
  services: ServiceItem[];
  dnsConfigured: boolean;
  proxyConfigured: boolean;
}

interface TopologyModalContentProps {
  onClose: () => void;
  handleCopy: () => Promise<void>;
  copied: boolean;
  dnsProvider?: string | null;
  proxyProvider?: string | null;
  services: ServiceItem[];
  dnsConfigured: boolean;
  proxyConfigured: boolean;
}

function TopologyModalContent({
  onClose,
  handleCopy,
  copied,
  dnsProvider,
  proxyProvider,
  services,
  dnsConfigured,
  proxyConfigured,
}: TopologyModalContentProps): JSX.Element {
  return (
    <div
      className="mx-4 w-full max-w-5xl rounded-lg border border-[#30363d]/50 bg-gradient-to-br from-[#1c2128]/65 to-[#161b22]/70 shadow-2xl shadow-[#58a6ff]/10 backdrop-blur-md"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-[#30363d]/50 bg-[#0d1117]/30 px-6 py-4">
        <div id="topology-title" className="text-base font-semibold text-[#e6edf3]">
          Network Topology
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 rounded border border-[#30363d] px-3 py-1.5 text-xs transition-colors hover:border-[#58a6ff] hover:text-[#58a6ff]"
          >
            <span>{copied ? '✓' : '📋'}</span>
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          <button
            onClick={onClose}
            className="text-[#8b949e] transition-colors hover:text-[#c9d1d9]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="max-h-[80vh] overflow-y-auto p-6">
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

export function TopologyPanel({
  isOpen,
  onClose,
  dnsProvider,
  proxyProvider,
  services,
  dnsConfigured,
  proxyConfigured,
}: TopologyPanelProps): JSX.Element | null {
  const [copied, setCopied] = useState(false);

  useEffect((): (() => void) | void => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return (): void => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

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
    await copyToClipboard(ascii);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="topology-title"
    >
      <TopologyModalContent
        onClose={onClose}
        handleCopy={handleCopy}
        copied={copied}
        dnsProvider={dnsProvider}
        proxyProvider={proxyProvider}
        services={services}
        dnsConfigured={dnsConfigured}
        proxyConfigured={proxyConfigured}
      />
    </div>
  );
}
