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

function AliyunIcon({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 1608 1024" fill="none">
      <path
        fill="#ff6a00"
        d="M537.6,445.44h537.6V568.32H537.6Z"
      />
      <path
        fill="#ff6a00"
        d="M1341.44,5.12H988.16l87.04,122.88,256,81.92c46.08,15.36,76.8,61.44,76.8,107.52v389.12c0,46.08-30.72,92.16-76.8,107.52l-256,81.92-87.04,122.88h353.28c148.48,0,266.24-117.76,266.24-266.24V276.48C1607.68,128,1489.92,5.12,1341.44,5.12ZM276.48,814.08C230.4,798.72,199.68,752.64,199.68,706.56V317.44c0-46.08,30.72-92.16,76.8-107.52L532.48,128,619.52,5.12H266.24C117.76,5.12,0,128,0,276.48V747.52C0,896,117.76,1013.76,266.24,1013.76H619.52L532.48,890.88Z"
      />
    </svg>
  );
}

function TencentCloudIcon({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 5810 1024" fill="none">
      <path
        fill="#2E95FF"
        d="M4518.5 69.1c53 4.8 110.9 19.3 149.5 38.6 197.7 82 183.2 284.5 168.8 361.7-19.3 77.2-43.4 183.2-106.1 303.8-72.3 139.9-221.8 231.5-356.9 236.3-28.9 0-48.2 4.8-91.6 4.8-38.6 0-77.2 0-106.1-4.8-265.2-28.9-332.7-270.1-284.5-434 38.6-125.4 19.3-57.9 62.7-202.5 43.4-144.7 154.3-265.2 356.9-294.2 82-14.5 130.2-14.5 207.4-9.6zm-1504.6 28.9l-67.5 231.5H2430.5l308.6 289.3c62.7 57.9 86.8 149.5 57.9 226.7-28.9 82-110.9 139.8-202.5 139.8H1928.9l67.5-226.6h530.5L2218.3 469.4c-62.7-57.9-86.8-149.5-57.9-226.7 28.9-86.8 110.9-144.7 202.5-144.7h651zM810.2 98c24.1 4.8 48.2 9.6 67.5 14.5 168.8 48.2 173.6 188.1 168.8 231.5-4.8 38.6-57.9 308.6-125.4 424.4-82 139.8-183.2 202.5-284.5 212.2-24.1 0-77.2 4.8-149.5 4.8H0l226.7-752.3-48.2-96.4-77.2-135S559.4 49.8 810.2 98zm655.8 9.6l48.2 110.9 164 361.7 139.9-472.6h270l-241.1 834.8-14.5 38.6h-241.1l-33.8-82-183.2-395.4-139.9 477.4H959.6l250.8-800.5 9.7-33.8h246zM3496.2 98c101.3 0 159.1 14.5 207.4 33.8 48.2 24.1 82 48.2 120.6 101.3 4.8 4.8 4.8 9.6 9.6 14.5 28.9 53 38.6 125.4 33.7 178.4-4.8 53.1-28.9 154.3-86.8 236.3-57.9 82-178.4 139.8-366.5 139.8h-255.6l-53 173.6h-255.6l115.7-395.4h9.6v4.8h356.9c53 0 101.3 0 154.3-14.5 53-14.5 77.2-38.6 96.4-67.5 19.3-38.6 28.9-86.8 19.3-120.5-14.5-33.8-57.9-57.9-110.9-57.9h-453.3l62.7-226.6h395.4zm1890.4 0c110.9 0 183.2 9.6 236.3 24.1 164 48.2 173.6 188.1 168.8 226.6-4.8 33.8-57.9 299-125.4 414.7-77.2 135-178.4 202.5-279.7 207.4-24.1 0-77.2 4.8-149.5 4.8h-477.4l260.4-877.7h366.5zm-935.5 173.6c-53 0-62.7 0-86.8 9.6-24.1 9.6-110.9 28.9-149.5 154.3-38.6 125.4-24.1 82-53.1 159.1-28.9 72.3-43.4 207.3 120.6 217 14.5 0 28.9 0 53.1-4.8 57.9-9.6 115.7-48.2 144.7-101.3 38.6-77.2 82-212.2 91.6-245.9 9.6-48.2 9.6-91.6-9.6-125.4-19.3-33.8-67.5-62.7-110.9-62.7zm766.8 38.6l-135 453.3h164c72.3 0 144.7-14.5 183.2-86.8 38.6-67.5 82-217 86.8-250.8 9.6-38.6-4.8-101.3-67.5-110.9-62.7-4.8-139.9-4.8-231.5-4.8zM354.1 300.8l-144.7 462.9h168.8c72.3 0 144.7-14.5 188.1-91.6 38.6-72.3 82-221.8 91.6-255.6 9.6-43.4-4.8-101.3-67.5-110.9-67.5-4.8-144.7-4.8-236.3-4.8z"
      />
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
    return <AliyunIcon size={size} />;
  }

  if (normalizedProvider === 'dnspod') {
    return <TencentCloudIcon size={size} />;
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
    dnspod: 'DNSPod',
  };

  return displayNames[provider.toLowerCase()] || provider;
}
