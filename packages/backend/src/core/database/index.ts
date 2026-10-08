import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import * as schema from './schema.js';
import { createLogger } from '../logger/index.js';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const logger = createLogger('database');

export type AppDatabase = BetterSQLite3Database<typeof schema>;

let db: AppDatabase | null = null;
let dbPath: string | null = null;
let sqliteConnection: Database.Database | null = null;

type JournalEntry = { idx: number; when: number; tag: string };

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

function readJournal(migrationsPath: string): JournalEntry[] {
  const journalPath = join(migrationsPath, 'meta', '_journal.json');
  if (!existsSync(journalPath)) return [];
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as { entries?: JournalEntry[] };
  return [...(journal.entries ?? [])].sort((a, b) => a.idx - b.idx);
}

function tableExists(name: string): boolean {
  if (!sqliteConnection) return false;
  const row = sqliteConnection
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name);
  return Boolean(row);
}

function columnExists(table: string, column: string): boolean {
  if (!sqliteConnection || !tableExists(table)) return false;
  const rows = sqliteConnection.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some(r => r.name === column);
}

/**
 * Reports whether every object a migration creates is already present. Used to
 * decide which migrations a database that predates migration tracking has
 * effectively applied, so we never mark one as applied without its schema.
 */
function isMigrationAlreadyApplied(migrationsPath: string, tag: string): boolean {
  const sqlPath = join(migrationsPath, `${tag}.sql`);
  if (!existsSync(sqlPath)) return false;
  const sql = readFileSync(sqlPath, 'utf-8');

  const created = [...sql.matchAll(/CREATE TABLE\s+`?(\w+)`?/gi)].map(m => m[1]);
  const altered = [
    ...sql.matchAll(/ALTER TABLE\s+`?(\w+)`?\s+ADD\s+(?:COLUMN\s+)?`?(\w+)`?/gi),
  ].map(m => [m[1], m[2]] as const);

  if (created.length === 0 && altered.length === 0) return false;

  return (
    created.every(table => tableExists(table)) &&
    altered.every(([table, column]) => columnExists(table, column))
  );
}

/**
 * Seeds __drizzle_migrations for databases created before migration tracking
 * existed. Each migration is recorded with its journal timestamp (not the
 * current time) so later migrations still compare as pending, and only
 * migrations whose schema is actually present are recorded.
 */
function initializeMigrationTracking(migrationsPath: string): void {
  if (!sqliteConnection) return;

  sqliteConnection
    .prepare(
      `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at INTEGER
      )`
    )
    .run();

  const existingCount = sqliteConnection
    .prepare('SELECT COUNT(*) as count FROM __drizzle_migrations')
    .get() as { count: number };

  if (existingCount.count > 0) return;

  const journal = readJournal(migrationsPath);
  const files = readMigrationFiles({ migrationsFolder: migrationsPath });
  const applied: string[] = [];

  for (const [index, entry] of journal.entries()) {
    const file = files[index];
    if (!file) break;
    if (!isMigrationAlreadyApplied(migrationsPath, entry.tag)) break;
    sqliteConnection
      .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run(file.hash, file.folderMillis);
    applied.push(entry.tag);
  }

  logger.info(`Marked ${applied.length} existing migrations as applied: ${applied.join(', ')}`);
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
  } catch (error: unknown) {
    const err = error as Error & { cause?: Error };
    const errorMessage = err.message || '';
    const errorStack = err.stack || '';
    const causedBy = err.cause?.message || '';

    const isTableExistsError =
      errorMessage.includes('already exists') ||
      errorStack.includes('already exists') ||
      causedBy.includes('already exists');

    if (isTableExistsError) {
      logger.warn('Migration conflict detected - tables exist but migration tracking is missing');
      logger.info('Initializing migration tracking for existing database...');
      try {
        initializeMigrationTracking(migrationsPath);
        logger.info('Migration tracking initialized, applying remaining migrations...');
        migrate(database, { migrationsFolder: migrationsPath });
        logger.info('Database migrations complete');
        return;
      } catch (recoveryError) {
        logger.error('Failed to recover from migration conflict', { recoveryError });
      }
    }

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

export function closeDatabase(): void {
  sqliteConnection?.close();
  sqliteConnection = null;
  db = null;
  dbPath = null;
}

export function resetDatabase(): void {
  if (!sqliteConnection || !dbPath || !db) {
    logger.warn('No database connection to reset');
    return;
  }

  logger.warn('Resetting database - dropping all tables');

  sqliteConnection.exec(`
    DROP TABLE IF EXISTS services;
    DROP TABLE IF EXISTS npm_access_lists;
    DROP TABLE IF EXISTS provider_configs;
    DROP TABLE IF EXISTS __drizzle_migrations;
  `);

  runMigrations(db);

  logger.info('Database reset complete - all data cleared');
}
