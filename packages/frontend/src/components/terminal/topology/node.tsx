import { TERMINAL_COLORS } from '../theme';
import { getProviderDisplayName, ProviderIcon } from '../provider-icons';

interface TopologyNodeProps {
  emoji: string;
  label: string;
  configured?: boolean;
  statusText?: string;
  isDocker?: boolean;
  isInternet?: boolean;
  bothConfigured?: boolean;
  provider?: string | null;
}

interface BaseNodeProps {
  emoji: string;
  label: string;
  borderStyle: string;
  labelColor?: string;
  statusText: string;
  statusColor: string;
  provider?: string | null;
}

function DockerIcon({ color }: { color: string }): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="14" width="4" height="4" fill={color} />
      <rect x="9" y="14" width="4" height="4" fill={color} />
      <rect x="14" y="14" width="4" height="4" fill={color} />
      <rect x="19" y="14" width="4" height="4" fill={color} />
      <rect x="9" y="9" width="4" height="4" fill={color} />
      <rect x="14" y="9" width="4" height="4" fill={color} />
      <rect x="14" y="4" width="4" height="4" fill={color} />
      <path d="M24 16 C28 16, 28 20, 26 22" stroke={color} strokeWidth="1.5" fill="none" />
      <rect
        x="2"
        y="19"
        width="22"
        height="8"
        rx="1"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

function DnsIcon({ color }: { color: string }): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="10" stroke={color} strokeWidth="2" fill="none" />
      <circle cx="16" cy="16" r="6" stroke={color} strokeWidth="1.5" fill="none" />
      <text x="16" y="20" fontSize="14" fill={color} textAnchor="middle" fontFamily="monospace">
        @
      </text>
    </svg>
  );
}

function ProxyIcon({ color }: { color: string }): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
      <path d="M6 16 L12 16" stroke={color} strokeWidth="2" />
      <path d="M20 16 L26 16" stroke={color} strokeWidth="2" />
      <rect
        x="11"
        y="11"
        width="10"
        height="10"
        rx="1"
        stroke={color}
        strokeWidth="2"
        fill="none"
      />
      <circle cx="16" cy="16" r="2" fill={color} />
    </svg>
  );
}

function InternetIcon({ color }: { color: string }): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="11" stroke={color} strokeWidth="2" fill="none" />
      <ellipse cx="16" cy="16" rx="5" ry="11" stroke={color} strokeWidth="1.5" fill="none" />
      <line x1="5" y1="16" x2="27" y2="16" stroke={color} strokeWidth="1.5" />
      <path d="M16 5 Q 22 16, 16 27" stroke={color} strokeWidth="1.5" fill="none" />
      <path d="M16 5 Q 10 16, 16 27" stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function getIconComponent(emoji: string, color: string): JSX.Element {
  switch (emoji) {
    case 'docker':
      return <DockerIcon color={color} />;
    case 'dns':
      return <DnsIcon color={color} />;
    case 'proxy':
      return <ProxyIcon color={color} />;
    case 'internet':
      return <InternetIcon color={color} />;
    default:
      return <span style={{ fontSize: '24px' }}>{emoji}</span>;
  }
}

function BaseNode({
  emoji,
  label,
  borderStyle,
  labelColor,
  statusText,
  statusColor,
  provider,
}: BaseNodeProps): JSX.Element {
  const nodeClass = 'flex flex-col items-center gap-1 text-center';
  const labelClass = 'text-xs font-bold uppercase tracking-wider';
  const iconColor = labelColor || '#8b949e';

  const shouldUseProviderIcon = provider && (emoji === 'dns' || emoji === 'proxy');

  return (
    <div className={nodeClass}>
      <div className={borderStyle}>
        <div className="flex items-center justify-center" style={{ height: '24px' }}>
          {shouldUseProviderIcon ? (
            <ProviderIcon provider={provider} size={24} color={iconColor} />
          ) : (
            getIconComponent(emoji, iconColor)
          )}
        </div>
        <div className={labelClass} style={{ color: iconColor }}>
          {label}
        </div>
        {provider && (
          <div className="mt-0.5 text-xs" style={{ color: iconColor }}>
            {getProviderDisplayName(provider)}
          </div>
        )}
      </div>
      <div className="text-xs" style={{ color: statusColor }}>
        {statusText}
      </div>
    </div>
  );
}

export function TopologyNode({
  emoji,
  label,
  configured,
  statusText,
  isDocker,
  isInternet,
  bothConfigured,
  provider,
}: TopologyNodeProps): JSX.Element {
  if (isDocker) {
    return (
      <BaseNode
        emoji={emoji}
        label={label}
        borderStyle="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2"
        statusText="Services"
        statusColor="#8b949e"
        provider={provider}
      />
    );
  }

  if (isInternet) {
    return (
      <BaseNode
        emoji={emoji}
        label={label}
        borderStyle={`rounded-lg border px-3 py-2 ${
          bothConfigured
            ? 'border-[#58a6ff] bg-[#0d1117]'
            : 'border-dashed border-[#30363d] bg-[#0d1117] opacity-50'
        }`}
        statusText={statusText || ''}
        statusColor={bothConfigured ? TERMINAL_COLORS.success : TERMINAL_COLORS.textMuted}
        provider={provider}
      />
    );
  }

  if (configured) {
    return (
      <BaseNode
        emoji={emoji}
        label={label}
        borderStyle="rounded-lg border px-3 py-2 bg-[#0d1117]"
        labelColor={TERMINAL_COLORS.success}
        statusText="Configured ✓"
        statusColor={TERMINAL_COLORS.success}
        provider={provider}
      />
    );
  }

  return (
    <BaseNode
      emoji={emoji}
      label={label}
      borderStyle="rounded-lg border border-dashed border-[#30363d] bg-[#0d1117] px-3 py-2 opacity-50"
      statusText="Not configured ✗"
      statusColor="#f85149"
      provider={provider}
    />
  );
}
