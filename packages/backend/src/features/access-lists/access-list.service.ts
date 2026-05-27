import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../core/database/index.js';
import * as schema from '../../core/database/schema.js';
import { createLogger } from '../../core/logger/index.js';
import type { NpmProxyProvider } from '../proxy/providers/npm.js';
import type { SettingsService } from '../settings/settings.service.js';

const logger = createLogger('access-list-service');

export interface AccessListRecord {
  id: number;
  name: string;
  satisfyAny: boolean | null;
  passAuth: boolean | null;
  proxyHostCount: number | null;
  syncedAt: Date | null;
}

export class AccessListService {
  constructor(
    private db: AppDatabase,
    private settings: SettingsService
  ) {}

  async syncFromProvider(): Promise<{ synced: number }> {
    const provider = await this.getNpmProvider();
    if (!provider) return { synced: 0 };

    try {
      const lists = await provider.listAccessLists();
      const now = new Date();

      const existingIds = new Set(
        (await this.db.select({ id: schema.npmAccessLists.id }).from(schema.npmAccessLists)).map(
          r => r.id
        )
      );

      const remoteIds = new Set(lists.map(l => l.id));

      for (const al of lists) {
        const record = {
          id: al.id,
          name: al.name,
          satisfyAny: al.satisfy_any ?? false,
          passAuth: al.pass_auth ?? true,
          proxyHostCount: al.proxy_host_count ?? 0,
          syncedAt: now,
        };

        if (existingIds.has(al.id)) {
          await this.db
            .update(schema.npmAccessLists)
            .set(record)
            .where(eq(schema.npmAccessLists.id, al.id));
        } else {
          await this.db.insert(schema.npmAccessLists).values(record);
        }
      }

      for (const existingId of existingIds) {
        if (!remoteIds.has(existingId)) {
          await this.db
            .delete(schema.npmAccessLists)
            .where(eq(schema.npmAccessLists.id, existingId));
        }
      }

      logger.info({ count: lists.length }, 'Synced access lists from NPM');
      return { synced: lists.length };
    } catch (err) {
      logger.error({ err }, 'Failed to sync access lists');
      return { synced: 0 };
    }
  }

  async getAll(): Promise<AccessListRecord[]> {
    return this.db.select().from(schema.npmAccessLists).all();
  }

  async resolveByName(name: string): Promise<number | null> {
    const results = await this.db
      .select()
      .from(schema.npmAccessLists)
      .where(eq(schema.npmAccessLists.name, name))
      .limit(1);

    if (results.length > 0) return results[0].id;

    await this.syncFromProvider();

    const retry = await this.db
      .select()
      .from(schema.npmAccessLists)
      .where(eq(schema.npmAccessLists.name, name))
      .limit(1);

    if (retry.length > 0) return retry[0].id;

    logger.warn({ name }, 'Access list not found in NPM');
    return null;
  }

  private async getNpmProvider(): Promise<NpmProxyProvider | null> {
    const cfg = await this.settings.getProxyConfig();
    if (!cfg || cfg.provider !== 'npm') return null;

    const { NpmProxyProvider } = await import('../proxy/providers/npm.js');
    return new NpmProxyProvider({
      url: cfg.config.url,
      username: cfg.config.username,
      password: cfg.config.password,
    });
  }
}
