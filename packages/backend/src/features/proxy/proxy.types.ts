export type ProxyHost = {
  id: string;
  domain: string;
  targetHost: string;
  targetPort: number;
  ssl: boolean;
  sslPending?: boolean;
  sslError?: string;
  enabled: boolean;
};

export type ProxyProviderConfig = {
  url: string;
  username?: string;
  password?: string;
  token?: string;
};

export type CreateProxyHostInput = {
  domain: string;
  targetHost: string;
  targetPort: number;
  targetScheme?: 'http' | 'https';
  ssl?: boolean;
  skipDnsWait?: boolean;
};

export type UpdateProxyHostInput = {
  targetHost?: string;
  targetPort?: number;
  targetScheme?: 'http' | 'https';
};

export interface ProxyProvider {
  readonly name: string;
  createHost(input: CreateProxyHostInput): Promise<ProxyHost>;
  updateHost(hostId: string, input: UpdateProxyHostInput): Promise<ProxyHost>;
  deleteHost(hostId: string): Promise<void>;
  listHosts(): Promise<ProxyHost[]>;
  findByDomain(domain: string): Promise<ProxyHost | null>;
  retrySsl(hostId: string, domain: string): Promise<{ success: boolean; error?: string }>;
}
