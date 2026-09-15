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

function AliyunIcon({
  size = 24,
  color = '#8b949e',
}: {
  size?: number;
  color?: string;
}): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 1608 1024" fill="none">
      <path fill={color} d="M537.6,445.44h537.6V568.32H537.6Z" />
      <path
        fill={color}
        d="M1341.44,5.12H988.16l87.04,122.88,256,81.92c46.08,15.36,76.8,61.44,76.8,107.52v389.12c0,46.08-30.72,92.16-76.8,107.52l-256,81.92-87.04,122.88h353.28c148.48,0,266.24-117.76,266.24-266.24V276.48C1607.68,128,1489.92,5.12,1341.44,5.12ZM276.48,814.08C230.4,798.72,199.68,752.64,199.68,706.56V317.44c0-46.08,30.72-92.16,76.8-107.52L532.48,128,619.52,5.12H266.24C117.76,5.12,0,128,0,276.48V747.52C0,896,117.76,1013.76,266.24,1013.76H619.52L532.48,890.88Z"
      />
    </svg>
  );
}

function TencentCloudIcon({
  size = 24,
  color = '#8b949e',
}: {
  size?: number;
  color?: string;
}): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="11" stroke={color} strokeWidth="2" />
      <circle cx="16" cy="16" r="3" fill={color} />
      <circle cx="9" cy="10" r="2" fill={color} />
      <circle cx="23" cy="10" r="2" fill={color} />
      <circle cx="9" cy="22" r="2" fill={color} />
      <circle cx="23" cy="22" r="2" fill={color} />
      <path d="m11 12 3 3m7-3-3 3m-7 5 3-3m7 3-3-3" stroke={color} strokeWidth="1.5" />
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

  if (normalizedProvider === 'aliyun') {
    return <AliyunIcon size={size} color={color} />;
  }

  if (normalizedProvider === 'dnspod') {
    return <TencentCloudIcon size={size} color={color} />;
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
    aliyun: 'Aliyun',
    dnspod: 'Tencent Cloud DNSPod (China)',
  };

  return displayNames[provider.toLowerCase()] || provider;
}
