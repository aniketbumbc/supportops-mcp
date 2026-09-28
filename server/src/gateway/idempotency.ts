import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../errors';
import { getRedis, redisKey } from '../infra/redis';
import type { RequestContext } from './context';

/**
 * Makes a write safe to repeat. The same user sending the same request (same
 * operation, same arguments) within the TTL gets the original result back instead
 * of the action running again. AI agents retry, networks drop responses: this is
 * what stops a duplicate ticket or a double refund.
 *
 * - Key: user + operation + fingerprint of the arguments (key order doesn't matter).
 * - Concurrent identical requests: a short Redis lock lets one run; the others wait
 *   for its result and return it.
 * - Failures are NOT stored, so a failed request can simply be retried.
 * - Results must be JSON-serializable.
 */

export interface IdempotencyOptions {
  /** How long a finished result is remembered. Default 24 hours. */
  ttlSec?: number;
  /** How long one run may hold the lock. Default 30 seconds. */
  lockSec?: number;
}

export interface IdempotentResult<T> {
  result: T;
  /** True when this call returned a stored result instead of running. */
  replayed: boolean;
}

const DEFAULT_TTL_SEC = 24 * 60 * 60;
const DEFAULT_LOCK_SEC = 30;
const POLL_MS = 150;

/** JSON with sorted keys and no undefined values: same data → same string. */
export function stableJson(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .sort()
          .map((k) => [k, normalize((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(normalize(value));
}

/**
 * Stable identifier for "this user doing this operation with these arguments".
 * Also used as the Idempotency-Key sent to upstream systems (e.g. billing).
 */
export function idempotencyKeyFor(
  ctx: RequestContext,
  operation: string,
  args: unknown,
): string {
  const fingerprint = createHash('sha256')
    .update(stableJson(args))
    .digest('hex')
    .slice(0, 32);
  return `${ctx.tenantId}:${ctx.userId}:${operation}:${fingerprint}`;
}
/**
 * The stored result of an earlier identical request, if any, without running anything.
 * For checks that must not happen on a retry (e.g. a duplicate check that would find
 * the record the first attempt created).
 */
export async function peekIdempotent<T>(
  ctx: RequestContext,
  operation: string,
  args: unknown,
): Promise<T | undefined> {
  const id = idempotencyKeyFor(ctx, operation, args);
  const raw = await getRedis().get(redisKey('idem', `{${id}}`, 'result'));
  return raw === null ? undefined : (JSON.parse(raw) as { result: T }).result;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Releases the lock only if we still own it (it may have expired and been taken). */
const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

export async function withIdempotency<T>(
  ctx: RequestContext,
  operation: string,
  args: unknown,
  run: () => Promise<T>,
  options: IdempotencyOptions = {},
): Promise<IdempotentResult<T>> {
  const redis = getRedis();
  const id = idempotencyKeyFor(ctx, operation, args);
  const resultKey = redisKey('idem', `{${id}}`, 'result');
  const lockKey = redisKey('idem', `{${id}}`, 'lock');
  const ttlSec = options.ttlSec ?? DEFAULT_TTL_SEC;
  const lockSec = options.lockSec ?? DEFAULT_LOCK_SEC;

  const stored = async (): Promise<T | undefined> => {
    const raw = await redis.get(resultKey);
    return raw === null ? undefined : (JSON.parse(raw) as { result: T }).result;
  };

  // 1. Already done? Return the original result.
  const previous = await stored();
  if (previous !== undefined) {
    ctx.log.info({ operation }, 'Idempotent replay: returning stored result');
    return { result: previous, replayed: true };
  }

  // 2. Take the lock. If another identical request holds it, wait: either its result
  //    appears (return it), or it fails and releases the lock (then we try ourselves).
  const owner = randomUUID();
  const deadline = Date.now() + lockSec * 1000;
  while ((await redis.set(lockKey, owner, 'EX', lockSec, 'NX')) !== 'OK') {
    if (Date.now() > deadline) {
      throw new AppError(
        'CONFLICT',
        'An identical request is already being processed. Check the result before retrying.',
        { details: { operation } },
      );
    }
    await sleep(POLL_MS);
    const theirs = await stored();
    if (theirs !== undefined) return { result: theirs, replayed: true };
  }

  // A result may have been stored between our first check and taking the lock.
  const late = await stored();
  if (late !== undefined) {
    await redis.eval(RELEASE_LOCK, 1, lockKey, owner).catch(() => undefined);
    return { result: late, replayed: true };
  }

  // 3. We own the lock: run, store the result, release.
  try {
    const result = await run();
    await redis.set(resultKey, JSON.stringify({ result }), 'EX', ttlSec);
    return { result, replayed: false };
  } finally {
    await redis.eval(RELEASE_LOCK, 1, lockKey, owner).catch(() => undefined);
  }
}
