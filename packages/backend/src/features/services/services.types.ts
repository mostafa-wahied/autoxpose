export type Service = {
  id: string;
  name: string;
  subdomain: string;
  port: number;
  scheme: string;
  enabled: boolean;
  source: string;
  sourceId: string | null;
  dnsRecordId: string | null;
  proxyHostId: string | null;
  exposureSource: string | null;
  dnsExists: boolean | null;
  proxyExists: boolean | null;
  lastReachabilityCheck: Date | null;
  reachabilityStatus: string | null;
  configWarnings: string | null;
  exposedSubdomain: string | null;
  sslPending: boolean | null;
  sslError: string | null;
  sslForced: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateServiceInput = {
  name: string;
  subdomain: string;
  port: number;
  scheme?: string;
  source?: string;
  sourceId?: string;
};

export type UpdateServiceInput = Partial<CreateServiceInput> & {
  enabled?: boolean;
};
