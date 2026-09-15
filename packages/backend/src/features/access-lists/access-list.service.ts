import { eq, isNotNull, notInArray } from 'drizzle-orm';
import type { AppDatabase } from '../../core/database/index.js';
import * as schema from '../../core/database/schema.js';
import { createLogger } from '../../core/logger/index.js';
import type { NpmAccessList } from '../proxy/providers/npm.js';
import type { ProxyHost, ProxyProvider } from '../proxy/proxy.types.js';
import type { SettingsService } from '../settings/settings.service.js';

const logger = createLogger('access-list-service');

/** Reserved label value that explicitly removes any access list from a host. */
export const PUBLIC_ACCESS_LIST = 'public';

export interface AccessListRecord {
  id: number;
  name: string;
  satisfyAny: boolean | null;
  passAuth: boolean | null;
  proxyHostCount: number | null;
  syncedAt: Date | null;
}

export type SyncResult = { ok: boolean; synced: number; error?: string };

/** Anything able to list NPM access lists; injected in tests. */
export interface AccessListSource {
  listAccessLists(): Promise<NpmAccessList[]>;
}

export type AccessListResolution =
  | { kind: 'unset' }
  | { kind: 'public' }
  | { kind: 'resolved'; id: number; name: string }
  | { kind: 'error'; message: string };

/** The subset of a service record that decides which access list applies. */
type AccessListTarget = { accessListName?: string | null };

export class AccessListService {
  constructor(
    private db: AppDatabase,
    private settings: SettingsService,
    private sourceFactory?: () => Promise<AccessListSource | null>
  ) {}

  /** True when the configured proxy provider is NPM; access lists are NPM-only. */
  async isSupported(): Promise<boolean> {
    const cfg = await this.settings.getProxyConfig();
    return cfg?.provider === 'npm';
  }

  async syncFromProvider(): Promise<SyncResult> {
    const provider = await this.getNpmProvider();
    if (!provider) {
      await this.clearCache();
      return { ok: true, synced: 0 };
    }

    let lists;
    try {
      lists = await provider.listAccessLists();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err }, 'Failed to sync access lists from NPM');
      return { ok: false, synced: 0, error: message };
    }

    this.warnOnDuplicateNames(lists.map(l => l.name));
    await this.persist(lists);
    logger.info({ count: lists.length }, 'Synced access lists from NPM');
    return { ok: true, synced: lists.length };
  }

  private async persist(lists: NpmAccessList[]): Promise<void> {
    const now = new Date();
    const existingIds = new Set(
      (await this.db.select({ id: schema.npmAccessLists.id }).from(schema.npmAccessLists)).map(
        r => r.id
      )
    );

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

    await this.dropListsMissingFrom(lists.map(l => l.id));
  }

  /** Deletes cached lists no longer present in NPM and clears services pointing at them. */
  private async dropListsMissingFrom(remoteIds: number[]): Promise<void> {
    if (remoteIds.length === 0) {
      await this.clearCache();
      return;
    }
    await this.db
      .delete(schema.npmAccessLists)
      .where(notInArray(schema.npmAccessLists.id, remoteIds));
    await this.db
      .update(schema.services)
      .set({ accessListId: null })
      .where(notInArray(schema.services.accessListId, remoteIds));
  }

  /** Drops every cached list and every stale reference to one. */
  async clearCache(): Promise<void> {
    await this.db.delete(schema.npmAccessLists);
    await this.db
      .update(schema.services)
      .set({ accessListId: null })
      .where(isNotNull(schema.services.accessListId));
  }

  /**
   * Called when the proxy settings change: the cached ids belong to the old NPM
   * instance, so they are dropped and re-synced from whatever is configured now.
   */
  async onProxyConfigChanged(): Promise<SyncResult> {
    await this.clearCache();
    return this.syncFromProvider();
  }

  private warnOnDuplicateNames(names: string[]): void {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const name of names) {
      if (seen.has(name)) duplicates.add(name);
      seen.add(name);
    }
    if (duplicates.size > 0) {
      logger.warn(
        { duplicates: [...duplicates] },
        'NPM has access lists sharing a name; containers referencing them will be rejected'
      );
    }
  }

  async getAll(): Promise<AccessListRecord[]> {
    return this.db.select().from(schema.npmAccessLists).all();
  }

  async getNames(): Promise<string[]> {
    const rows = await this.db
      .select({ name: schema.npmAccessLists.name })
      .from(schema.npmAccessLists);
    return rows.map(r => r.name).sort();
  }

  /**
   * Resolves a label value to an access list. Requires exactly one exact name
   * match; a missing or ambiguous name is an error, never a silent fallback to
   * public access.
   */
  async resolve(name: string | null): Promise<AccessListResolution> {
    if (name === null) return { kind: 'unset' };
    if (name.toLowerCase() === PUBLIC_ACCESS_LIST) return { kind: 'public' };

    if (!(await this.isSupported())) {
      return {
        kind: 'error',
        message: `Access lists require Nginx Proxy Manager; "${name}" cannot be applied with the configured proxy provider.`,
      };
    }

    let matches = await this.findByName(name);
    if (matches.length === 0) {
      const sync = await this.syncFromProvider();
      if (!sync.ok) {
        return {
          kind: 'error',
          message: `Could not reach Nginx Proxy Manager to validate access list "${name}": ${sync.error}`,
        };
      }
      matches = await this.findByName(name);
    }

    if (matches.length === 1) return { kind: 'resolved', id: matches[0].id, name: matches[0].name };

    if (matches.length > 1) {
      return {
        kind: 'error',
        message: `Access list "${name}" is ambiguous: NPM has ${matches.length} lists with that exact name. Rename them so the reference is unique.`,
      };
    }

    const available = await this.getNames();
    const listing = available.length > 0 ? available.join(', ') : '(none)';
    return {
      kind: 'error',
      message: `Access list "${name}" not found in NPM. Available access lists: ${listing}. Use "public" to expose without an access list.`,
    };
  }

  private async findByName(name: string): Promise<AccessListRecord[]> {
    return this.db
      .select()
      .from(schema.npmAccessLists)
      .where(eq(schema.npmAccessLists.name, name))
      .all();
  }

  /**
   * Resolves the id to store for a discovered container. Never throws: an
   * unresolved name is stored as `accessListId: null` alongside the requested
   * name, which is what blocks exposure later on.
   */
  async resolveForStorage(name: string | null): Promise<number | null> {
    const resolution = await this.resolve(name);
    if (resolution.kind === 'resolved') return resolution.id;
    if (resolution.kind === 'error') logger.warn({ name }, resolution.message);
    return null;
  }

  /**
   * Access list id to send when creating a proxy host. Throws when the
   * container references a list that cannot be resolved, so exposure is blocked
   * instead of silently creating a public host.
   */
  async accessListIdForCreate(target: AccessListTarget): Promise<number | undefined> {
    const resolution = await this.resolve(target.accessListName ?? null);
    if (resolution.kind === 'error') throw new Error(resolution.message);
    if (resolution.kind === 'resolved') return resolution.id;
    return undefined;
  }

  /**
   * Brings an existing NPM host in line with the container's label and reports
   * the access list the host actually carries afterwards.
   *
   * - no label: the host keeps whatever protection it already has
   * - `public`: the access list is removed from the host
   * - a name: the host is updated to that list
   */
  async reconcileProxyHost(
    target: AccessListTarget,
    proxyHost: ProxyHost,
    proxy: ProxyProvider
  ): Promise<{ accessListId: number | null; error?: string }> {
    const actual = proxyHost.accessListId ?? 0;
    const resolution = await this.resolve(target.accessListName ?? null);

    if (resolution.kind === 'unset') return { accessListId: actual || null };
    if (resolution.kind === 'error') {
      logger.warn({ host: proxyHost.domain }, resolution.message);
      return { accessListId: actual || null, error: resolution.message };
    }

    const desired = resolution.kind === 'public' ? 0 : resolution.id;
    if (desired === actual) return { accessListId: desired || null };

    try {
      await proxy.updateHost(proxyHost.id, { accessListId: desired });
      logger.info(
        { host: proxyHost.domain, from: actual, to: desired },
        'Updated NPM access list for proxy host'
      );
      return { accessListId: desired || null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err, host: proxyHost.domain }, 'Failed to update NPM access list');
      return { accessListId: actual || null, error: message };
    }
  }

  private async getNpmProvider(): Promise<AccessListSource | null> {
    if (this.sourceFactory) return this.sourceFactory();

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
