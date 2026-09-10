import type { SettingsStatus } from '../../../lib/api';

export type DnsFormValues = {
  token: string;
  zoneId: string;
  domain: string;
  apiKey: string;
  secretKey: string;
  accessKeyId: string;
  accessKeySecret: string;
  secretId: string;
  dnspodSecretKey: string;
};

export type SavedDnsCredentials = {
  tokenProvider: string | null;
  porkbun: boolean;
  aliyun: boolean;
  dnspod: boolean;
};

export function buildDnsConfig(provider: string, values: DnsFormValues): Record<string, string> {
  if (provider === 'porkbun') {
    return { apiKey: values.apiKey, secretKey: values.secretKey, domain: values.domain };
  }
  if (provider === 'digitalocean') return { token: values.token, domain: values.domain };
  if (provider === 'aliyun') {
    return {
      accessKeyId: values.accessKeyId,
      accessKeySecret: values.accessKeySecret,
      domain: values.domain,
    };
  }
  if (provider === 'dnspod') {
    return {
      secretId: values.secretId,
      secretKey: values.dnspodSecretKey,
      domain: values.domain,
    };
  }
  return { token: values.token, zoneId: values.zoneId, domain: values.domain };
}

export function getSavedDnsCredentials(current: SettingsStatus['dns'] | null): SavedDnsCredentials {
  const config = current?.config;
  return {
    tokenProvider:
      current?.provider &&
      ['cloudflare', 'netlify', 'digitalocean'].includes(current.provider) &&
      config?.token
        ? current.provider
        : null,
    porkbun: Boolean(current?.provider === 'porkbun' && config?.apiKey && config?.secretKey),
    aliyun: Boolean(
      current?.provider === 'aliyun' && config?.accessKeyId && config?.accessKeySecret
    ),
    dnspod: Boolean(current?.provider === 'dnspod' && config?.secretId && config?.secretKey),
  };
}

function hasCredentialPair(first: string, second: string, saved: boolean): boolean {
  return Boolean((first && second) || (saved && !first && !second));
}

export function canSaveDnsConfig(
  provider: string,
  values: DnsFormValues,
  saved: SavedDnsCredentials
): boolean {
  if (!values.domain.trim()) return false;
  if ((provider === 'cloudflare' || provider === 'netlify') && !values.zoneId.trim()) {
    return false;
  }
  if (provider === 'porkbun') {
    return hasCredentialPair(values.apiKey, values.secretKey, saved.porkbun);
  }
  if (provider === 'aliyun') {
    return hasCredentialPair(values.accessKeyId, values.accessKeySecret, saved.aliyun);
  }
  if (provider === 'dnspod') {
    return hasCredentialPair(values.secretId, values.dnspodSecretKey, saved.dnspod);
  }
  return Boolean(values.token || saved.tokenProvider === provider);
}
