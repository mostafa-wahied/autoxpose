import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { createLogger } from '../logger/index.js';

const logger = createLogger('database');

export type AppDatabase = BetterSQLite3Database<typeof schema>;

let db: AppDatabase | null = null;
let dbPath: string | null = null;
let sqliteConnection: Database.Database | null = null;

function recreateSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subdomain TEXT NOT NULL,
      port INTEGER NOT NULL,
      scheme TEXT DEFAULT 'http',
      enabled INTEGER DEFAULT 1,
      source TEXT NOT NULL,
      source_id TEXT,
      dns_record_id TEXT,
      proxy_host_id TEXT,
      exposure_source TEXT,
      dns_exists INTEGER,
      proxy_exists INTEGER,
      last_reachability_check INTEGER,
      reachability_status TEXT,
      config_warnings TEXT,
      exposed_subdomain TEXT,
      ssl_pending INTEGER,
      ssl_error TEXT,
      ssl_forced INTEGER DEFAULT 0,
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
}

export function getDatabase(path: string): AppDatabase {
  if (!db) {
    sqliteConnection = new Database(path);
    recreateSchema(sqliteConnection);
    db = drizzle(sqliteConnection, { schema });
    dbPath = path;
  }
  return db;
}

export function resetDatabase(): void {
  if (!sqliteConnection || !dbPath) {
    logger.warn('No database connection to reset');
    return;
  }

  logger.warn('Resetting database - dropping all tables');

  sqliteConnection.exec(`
    DROP TABLE IF EXISTS services;
    DROP TABLE IF EXISTS provider_configs;
  `);

  recreateSchema(sqliteConnection);

  logger.info('Database reset complete - all data cleared');
}
