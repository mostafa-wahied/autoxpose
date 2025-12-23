import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { ChangeTracker } from '../../core/change-tracker.js';
import type { AppDatabase } from '../../core/database/index.js';
import * as schema from '../../core/database/schema.js';

export interface ServiceRecord {
  id: string;
  name: string;
  subdomain: string;
  port: number;
  scheme: string | null;
  enabled: boolean | null;
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
  sslForced: boolean | null;
  tags: string | null;
  hasExplicitSubdomainLabel: boolean | null;
  labelMismatchIgnored: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateServiceInput {
  name: string;
  subdomain: string;
  port: number;
  scheme?: string;
  source: string;
  sourceId?: string;
  tags?: string;
  hasExplicitSubdomainLabel?: boolean;
}

export interface UpdateServiceInput {
  name?: string;
  subdomain?: string;
  port?: number;
  scheme?: string;
  enabled?: boolean;
  dnsRecordId?: string | null;
  proxyHostId?: string | null;
  exposureSource?: string | null;
  dnsExists?: boolean | null;
  proxyExists?: boolean | null;
  lastReachabilityCheck?: Date | null;
  reachabilityStatus?: string | null;
  configWarnings?: string | null;
  exposedSubdomain?: string | null;
  sslPending?: boolean | null;
  sslError?: string | null;
  sslForced?: boolean;
  tags?: string | null;
  hasExplicitSubdomainLabel?: boolean;
  labelMismatchIgnored?: boolean;
}

export class ServicesRepository {
  constructor(
    private db: AppDatabase,
    private changeTracker: ChangeTracker
  ) {}

  async findAll(): Promise<ServiceRecord[]> {
    return this.db.select().from(schema.services).all();
  }

  async findById(id: string): Promise<ServiceRecord | undefined> {
    const results = await this.db
      .select()
      .from(schema.services)
      .where(eq(schema.services.id, id))
      .limit(1);
    return results[0];
  }

  async findBySourceId(sourceId: string): Promise<ServiceRecord | undefined> {
    const results = await this.db
      .select()
      .from(schema.services)
      .where(eq(schema.services.sourceId, sourceId))
      .limit(1);
    return results[0];
  }

  async create(input: CreateServiceInput): Promise<ServiceRecord> {
    const id = nanoid();
    const now = new Date();
    const record = {
      id,
      name: input.name,
      subdomain: input.subdomain,
      port: input.port,
      scheme: input.scheme ?? 'http',
      enabled: false,
      source: input.source,
      sourceId: input.sourceId ?? null,
      hasExplicitSubdomainLabel: input.hasExplicitSubdomainLabel ?? false,
      labelMismatchIgnored: false,
      dnsRecordId: null,
      proxyHostId: null,
      exposureSource: null,
      dnsExists: null,
      proxyExists: null,
      lastReachabilityCheck: null,
      reachabilityStatus: null,
      configWarnings: null,
      exposedSubdomain: null,
      sslPending: null,
      sslError: null,
      sslForced: false,
      tags: input.tags ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(schema.services).values(record);
    this.changeTracker.increment();
    return record;
  }

  async update(id: string, input: UpdateServiceInput): Promise<ServiceRecord | undefined> {
    const existing = await this.findById(id);
    if (!existing) return undefined;

    await this.db
      .update(schema.services)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.services.id, id));

    this.changeTracker.increment();
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(schema.services).where(eq(schema.services.id, id));
    if (result.changes > 0) {
      this.changeTracker.increment();
    }
    return result.changes > 0;
  }
}
