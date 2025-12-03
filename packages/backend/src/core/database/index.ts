import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

let db: AppDatabase | null = null;

export function getDatabase(path: string): AppDatabase {
  if (!db) {
    const sqlite = new Database(path);
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT NOT NULL,
        port INTEGER NOT NULL,
        scheme TEXT DEFAULT 'http',
        enabled INTEGER DEFAULT 1,
        source TEXT NOT NULL,
        source_id TEXT,
        dns_record_id TEXT,
        proxy_host_id TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        config TEXT NOT NULL,
        created_at INTEGER
      );
    `);
    db = drizzle(sqlite, { schema });
  }
  return db;
}
