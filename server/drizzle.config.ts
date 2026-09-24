import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Both schema files declare their own Postgres schema via pgSchema(), so
 * schemaFilter must list them explicitly: drizzle-kit only diffs 'public'
 * by default and would otherwise generate an empty migration.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/*.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ['mock', 'platform'],
  verbose: true,
  strict: true,
});
