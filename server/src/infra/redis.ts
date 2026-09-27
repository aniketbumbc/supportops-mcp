import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * One shared Redis connection for the whole process (rate limits now, more later).
 * - TLS is automatic for rediss:// URLs (most cloud providers).
 * - Every key goes through redisKey(), which adds an environment prefix, so dev and
 *   production can never read or overwrite each other's data in a shared Redis.
 */

export const KEY_PREFIX = env.REDIS_KEY_PREFIX ?? `crm:${env.NODE_ENV}:`;

/** Builds a namespaced key: redisKey('rl', 'user', id) → "crm:development:rl:user:<id>". */
export const redisKey = (...parts: (string | number)[]): string =>
  `${KEY_PREFIX}${parts.join(':')}`;

const log = logger.child({ component: 'redis' });

let client: Redis | undefined;

export function getRedis(): Redis {
  if (client) return client;

  client = new Redis(env.REDIS_URL, {
    connectionName: 'enterprise-crm-mcp',
    connectTimeout: 10_000,
    // Fail a command after 2 reconnect attempts instead of waiting forever.
    maxRetriesPerRequest: 2,
    // Reconnect with a growing delay, capped at 5 seconds.
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });

  client.on('ready', () => log.info({ prefix: KEY_PREFIX }, 'Redis connected'));
  client.on('reconnecting', (delayMs: number) =>
    log.warn({ delayMs }, 'Redis reconnecting'),
  );
  // Without an error listener, ioredis errors would crash the process.
  client.on('error', (error: Error) =>
    log.error({ err: error.message }, 'Redis error'),
  );

  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => client?.disconnect());
  client = undefined;
}
