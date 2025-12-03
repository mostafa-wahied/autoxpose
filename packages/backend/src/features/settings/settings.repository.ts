import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { AppDatabase } from '../../core/database/index.js';
import * as schema from '../../core/database/schema.js';

export interface ProviderConfigRecord {
  id: string;
  type: string;
  provider: string;
  config: string;
  createdAt: Date | null;
}

export interface SaveProviderInput {
  type: 'dns' | 'proxy';
  provider: string;
  config: Record<string, string>;
}

export class SettingsRepository {
  constructor(private db: AppDatabase) {}

  async getByType(type: string): Promise<ProviderConfigRecord | undefined> {
    const results = await this.db
      .select()
      .from(schema.providerConfigs)
      .where(eq(schema.providerConfigs.type, type))
      .limit(1);
    return results[0];
  }

  async getByTypeAndProvider(
    type: string,
    provider: string
  ): Promise<ProviderConfigRecord | undefined> {
    const results = await this.db
      .select()
      .from(schema.providerConfigs)
      .where(
        and(eq(schema.providerConfigs.type, type), eq(schema.providerConfigs.provider, provider))
      )
      .limit(1);
    return results[0];
  }

  async save(input: SaveProviderInput): Promise<ProviderConfigRecord> {
    const existing = await this.getByType(input.type);

    if (existing) {
      await this.db
        .update(schema.providerConfigs)
        .set({ provider: input.provider, config: JSON.stringify(input.config) })
        .where(eq(schema.providerConfigs.id, existing.id));
      return { ...existing, provider: input.provider, config: JSON.stringify(input.config) };
    }

    const record = {
      id: nanoid(),
      type: input.type,
      provider: input.provider,
      config: JSON.stringify(input.config),
      createdAt: new Date(),
    };
    await this.db.insert(schema.providerConfigs).values(record);
    return record;
  }

  async delete(type: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.providerConfigs)
      .where(eq(schema.providerConfigs.type, type));
    return result.changes > 0;
  }
}
