import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { createLogger } from '../logger/index.js';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const logger = createLogger('database');

export type AppDatabase = BetterSQLite3Database<typeof schema>;

let db: AppDatabase | null = null;
let dbPath: string | null = null;
let sqliteConnection: Database.Database | null = null;

function getMigrationsPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const paths = [join(currentDir, '../../migrations'), join(currentDir, '../../../migrations')];

  for (const path of paths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return paths[0];
}

function runMigrations(database: AppDatabase): void {
  const migrationsPath = getMigrationsPath();

  if (!existsSync(migrationsPath)) {
    logger.warn(`Migrations directory not found at ${migrationsPath}, skipping migrations`);
    return;
  }

  try {
    logger.info('Running database migrations...');
    migrate(database, { migrationsFolder: migrationsPath });
    logger.info('Database migrations complete');
  } catch (error) {
    logger.error('Migration failed', { error });
    throw error;
  }
}

export function getDatabase(path: string): AppDatabase {
  if (!db) {
    sqliteConnection = new Database(path);
    db = drizzle(sqliteConnection, { schema });
    dbPath = path;
    runMigrations(db);
  }
  return db;
}

export function resetDatabase(): void {
  if (!sqliteConnection || !dbPath || !db) {
    logger.warn('No database connection to reset');
    return;
  }

  logger.warn('Resetting database - dropping all tables');

  sqliteConnection.exec(`
    DROP TABLE IF EXISTS services;
    DROP TABLE IF EXISTS provider_configs;
    DROP TABLE IF EXISTS __drizzle_migrations;
  `);

  runMigrations(db);

  logger.info('Database reset complete - all data cleared');
}
