import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

/**
 * One shared connection pool per process.
 * Works with Neon (direct or pooled URL) and any standard Postgres.
 * ne shared connection pool to Neon, wrapped by Drizzle, plus a
 * close function for clean shutdown.
 */
export const sql = postgres(env.DATABASE_URL, {
  prepare: env.DATABASE_PREPARE,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });

export type Database = typeof db;

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
