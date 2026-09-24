import postgres from 'postgres';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';

type CheckResult = { name: string; ok: boolean; detail: string };

async function checkPostgres(): Promise<CheckResult> {
  const sql = postgres(env.DATABASE_URL, {
    prepare: env.DATABASE_PREPARE,
    max: 1,
    connect_timeout: 10,
  });
  const started = Date.now();
  try {
    const rows = await sql<{ version: string }[]>`select version() as version`;
    const version =
      rows[0]?.version.split(' ').slice(0, 2).join(' ') ?? 'unknown';
    return {
      name: 'Postgres',
      ok: true,
      detail: `${version} (${Date.now() - started} ms)`,
    };
  } catch (error) {
    return { name: 'Postgres', ok: false, detail: (error as Error).message };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function checkRedis(): Promise<CheckResult> {
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 10_000,
    maxRetriesPerRequest: 1,
  });
  let lastError: Error | undefined;
  redis.on('error', (error: Error) => {
    lastError = error;
  });
  const started = Date.now();
  try {
    await redis.connect();
    const reply = await redis.ping();
    return {
      name: 'Redis',
      ok: reply === 'PONG',
      detail: `${reply} (${Date.now() - started} ms)`,
    };
  } catch (error) {
    return {
      name: 'Redis',
      ok: false,
      detail: (lastError ?? (error as Error)).message,
    };
  } finally {
    redis.disconnect();
  }
}

async function main() {
  console.log('Checking cloud connections...\n');
  const results = await Promise.all([checkPostgres(), checkRedis()]);
  for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.name.padEnd(9)} ${r.detail}`);
  }
  const allOk = results.every((r) => r.ok);
  console.log(
    allOk
      ? '\nAll connections healthy.'
      : '\nSome connections failed. Check your .env values.',
  );
  process.exit(allOk ? 0 : 1);
}

main();
