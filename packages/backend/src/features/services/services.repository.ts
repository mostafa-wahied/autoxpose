import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AppDatabase } from '../../core/database/index.js';
import * as schema from '../../core/database/schema.js';

export interface ServiceRecord {
  id: string;
  name: string;
  domain: string;
  port: number;
  scheme: string | null;
  enabled: boolean | null;
  source: string;
  sourceId: string | null;
  dnsRecordId: string | null;
  proxyHostId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateServiceInput {
  name: string;
  domain: string;
  port: number;
  scheme?: string;
  source: string;
  sourceId?: string;
}

export interface UpdateServiceInput {
  name?: string;
  domain?: string;
  port?: number;
  scheme?: string;
  enabled?: boolean;
  dnsRecordId?: string | null;
  proxyHostId?: string | null;
}

export class ServicesRepository {
  constructor(private db: AppDatabase) {}

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
      domain: input.domain,
      port: input.port,
      scheme: input.scheme ?? 'http',
      enabled: true,
      source: input.source,
      sourceId: input.sourceId ?? null,
      dnsRecordId: null,
      proxyHostId: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(schema.services).values(record);
    return record;
  }

  async update(id: string, input: UpdateServiceInput): Promise<ServiceRecord | undefined> {
    const existing = await this.findById(id);
    if (!existing) return undefined;

    await this.db
      .update(schema.services)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.services.id, id));

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(schema.services).where(eq(schema.services.id, id));
    return result.changes > 0;
  }
}
