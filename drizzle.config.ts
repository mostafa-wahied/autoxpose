import type { Config } from 'drizzle-kit';

export default {
  schema: './packages/backend/src/core/database/schema.ts',
  out: './packages/backend/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './packages/backend/data/autoxpose.db',
  },
} satisfies Config;
