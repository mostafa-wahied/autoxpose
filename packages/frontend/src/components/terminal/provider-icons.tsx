interface ProviderIconProps {
  provider: string;
  size?: number;
  color?: string;
}

function PorkbunIcon({
  size = 24,
  color = '#8b949e',
}: {
  size?: number;
  color?: string;
}): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="10" stroke={color} strokeWidth="2" fill="none" />
      <circle cx="16" cy="16" r="6" stroke={color} strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="14" r="1.5" fill={color} />
      <circle cx="20" cy="14" r="1.5" fill={color} />
      <ellipse cx="16" cy="18" rx="3" ry="2" stroke={color} strokeWidth="1" fill="none" />
      <circle cx="15" cy="18" r="0.5" fill={color} />
      <circle cx="17" cy="18" r="0.5" fill={color} />
    </svg>
  );
}

function CaddyIcon({
  size = 24,
  color = '#8b949e',
}: {
  size?: number;
  color?: string;
}): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="6" y="6" width="8" height="8" stroke={color} strokeWidth="1.5" fill="none" />
      <rect x="18" y="6" width="8" height="8" stroke={color} strokeWidth="1.5" fill="none" />
      <rect x="6" y="18" width="8" height="8" stroke={color} strokeWidth="1.5" fill="none" />
      <rect x="18" y="18" width="8" height="8" stroke={color} strokeWidth="1.5" fill="none" />
      <circle cx="10" cy="10" r="1" fill={color} />
      <circle cx="22" cy="10" r="1" fill={color} />
      <circle cx="10" cy="22" r="1" fill={color} />
      <circle cx="22" cy="22" r="1" fill={color} />
    </svg>
  );
}

export function ProviderIcon({
  provider,
  size = 24,
  color = '#8b949e',
}: ProviderIconProps): JSX.Element {
  const normalizedProvider = provider.toLowerCase();

  if (normalizedProvider === 'cloudflare') {
    return <i className="devicon-cloudflare-plain" style={{ fontSize: size, color }} />;
  }

  if (normalizedProvider === 'digitalocean') {
    return <i className="devicon-digitalocean-plain" style={{ fontSize: size, color }} />;
  }

  if (normalizedProvider === 'netlify') {
    return <i className="devicon-netlify-plain" style={{ fontSize: size, color }} />;
  }

  if (normalizedProvider === 'npm') {
    return <i className="devicon-nginx-original" style={{ fontSize: size, color }} />;
  }

  if (normalizedProvider === 'porkbun') {
    return <PorkbunIcon size={size} color={color} />;
  }

  if (normalizedProvider === 'caddy') {
    return <CaddyIcon size={size} color={color} />;
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `1px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.6,
        color,
      }}
    >
      {provider.charAt(0).toUpperCase()}
    </div>
  );
}

export function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    cloudflare: 'Cloudflare',
    digitalocean: 'DigitalOcean',
    netlify: 'Netlify',
    npm: 'Nginx Proxy Manager',
    porkbun: 'Porkbun',
    caddy: 'Caddy',
  };

  return displayNames[provider.toLowerCase()] || provider;
}
