export type ProxyHost = {
  id: string;
  domain: string;
  targetHost: string;
  targetPort: number;
  ssl: boolean;
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
};

export interface ProxyProvider {
  readonly name: string;
  createHost(input: CreateProxyHostInput): Promise<ProxyHost>;
  deleteHost(hostId: string): Promise<void>;
  listHosts(): Promise<ProxyHost[]>;
  findByDomain(domain: string): Promise<ProxyHost | null>;
}
