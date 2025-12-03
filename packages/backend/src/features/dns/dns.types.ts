export type DnsRecord = {
  id: string;
  hostname: string;
  type: string;
  value: string;
  ttl: number;
};

export type DnsProviderConfig = {
  token: string;
  zoneId?: string;
  domain?: string;
};

export type CreateRecordInput = {
  subdomain: string;
  ip: string;
  type?: string;
  ttl?: number;
};

export interface DnsProvider {
  readonly name: string;
  createRecord(input: CreateRecordInput): Promise<DnsRecord>;
  deleteRecord(recordId: string): Promise<void>;
  listRecords(): Promise<DnsRecord[]>;
}
