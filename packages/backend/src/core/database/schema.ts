import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const services = sqliteTable('services', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  port: integer('port').notNull(),
  scheme: text('scheme').default('http'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  source: text('source').notNull(),
  sourceId: text('source_id'),
  dnsRecordId: text('dns_record_id'),
  proxyHostId: text('proxy_host_id'),
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
