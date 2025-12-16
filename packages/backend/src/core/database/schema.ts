import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const services = sqliteTable('services', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  subdomain: text('subdomain').notNull(),
  port: integer('port').notNull(),
  scheme: text('scheme').default('http'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  source: text('source').notNull(),
  sourceId: text('source_id'),
  dnsRecordId: text('dns_record_id'),
  proxyHostId: text('proxy_host_id'),
  exposureSource: text('exposure_source'),
  dnsExists: integer('dns_exists', { mode: 'boolean' }),
  proxyExists: integer('proxy_exists', { mode: 'boolean' }),
  lastReachabilityCheck: integer('last_reachability_check', { mode: 'timestamp' }),
  reachabilityStatus: text('reachability_status'),
  configWarnings: text('config_warnings'),
  exposedSubdomain: text('exposed_subdomain'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const providerConfigs = sqliteTable('provider_configs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  config: text('config').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
