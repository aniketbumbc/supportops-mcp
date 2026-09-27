import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { getRedis, redisKey } from '../infra/redis';
import type { RateLimitRule } from '../policy/rate-limits';

/**
 * Sliding-window rate limiter in Redis.
 *
 * Each (rule, subject) is a sorted set of request timestamps. All logic runs inside
 * Lua scripts, so check-and-count is atomic: concurrent requests can never exceed a
 * limit. Timestamps come from Redis's own clock (TIME), so all server instances agree.
 * Several rules can be checked together, all-or-nothing: if one blocks, none is charged.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** The rule that blocked the request (null when allowed). */
  blockedBy: RateLimitRule | null;
  /** The tightest rule for this request: smallest remaining, for response headers. */
  limit: number;
  remaining: number;
  /** Seconds until the tightest window has room again. */
  resetSec: number;
  /** Seconds to wait before retrying (0 when allowed). */
  retryAfterSec: number;
}

// KEYS[i] = window key; ARGV = [limit1, windowMs1, limit2, windowMs2, ..., memberId]
// Returns { allowed, blockedIndex, retryMs, remaining, resetMs, limit } for the tightest rule.
const CONSUME = `
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
local n = #KEYS
local counts = {}
for i = 1, n do
  local limit = tonumber(ARGV[2 * i - 1])
  local window = tonumber(ARGV[2 * i])
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - window)
  local count = redis.call('ZCARD', KEYS[i])
  if count >= limit then
    local oldest = redis.call('ZRANGE', KEYS[i], 0, 0, 'WITHSCORES')
    local retry = window
    if oldest[2] then retry = tonumber(oldest[2]) + window - now end
    return {0, i, retry, 0, retry, limit}
  end
  counts[i] = count
end
local member = now .. '-' .. ARGV[2 * n + 1]
local best, bestReset, bestLimit = nil, 0, 0
for i = 1, n do
  local limit = tonumber(ARGV[2 * i - 1])
  local window = tonumber(ARGV[2 * i])
  redis.call('ZADD', KEYS[i], now, member)
  redis.call('PEXPIRE', KEYS[i], window)
  local remaining = limit - counts[i] - 1
  if best == nil or remaining < best then
    best = remaining
    bestLimit = limit
    local oldest = redis.call('ZRANGE', KEYS[i], 0, 0, 'WITHSCORES')
    bestReset = tonumber(oldest[2]) + window - now
  end
end
return {1, 0, 0, best, bestReset, bestLimit}
`;

// Counts only, never adds. Same ARGV layout (no memberId). Returns the same shape.
const PEEK = `
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
local best, bestReset, bestLimit = nil, 0, 0
for i = 1, #KEYS do
  local limit = tonumber(ARGV[2 * i - 1])
  local window = tonumber(ARGV[2 * i])
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - window)
  local count = redis.call('ZCARD', KEYS[i])
  local oldest = redis.call('ZRANGE', KEYS[i], 0, 0, 'WITHSCORES')
  local reset = 0
  if oldest[2] then reset = tonumber(oldest[2]) + window - now end
  if count >= limit then return {0, i, reset, 0, reset, limit} end
  local remaining = limit - count
  if best == nil or remaining < best then best, bestReset, bestLimit = remaining, reset, limit end
end
return {1, 0, 0, best, bestReset, bestLimit}
`;

// Adds a hit without checking (e.g. record a failed login). ARGV = [windowMs1, ..., memberId]
const HIT = `
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
local member = now .. '-' .. ARGV[#KEYS + 1]
for i = 1, #KEYS do
  local window = tonumber(ARGV[i])
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - window)
  redis.call('ZADD', KEYS[i], now, member)
  redis.call('PEXPIRE', KEYS[i], window)
end
return 1
`;

type ScriptReply = [number, number, number, number, number, number];

interface RateLimitCommands {
  rlConsume(
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<ScriptReply>;
  rlPeek(numKeys: number, ...args: (string | number)[]): Promise<ScriptReply>;
  rlHit(numKeys: number, ...args: (string | number)[]): Promise<number>;
}

let commands: (Redis & RateLimitCommands) | undefined;

/** Registers the scripts once; ioredis then runs them by hash (EVALSHA) and reloads if needed. */
function redis(): Redis & RateLimitCommands {
  if (commands) return commands;
  const client = getRedis();
  client.defineCommand('rlConsume', { lua: CONSUME });
  client.defineCommand('rlPeek', { lua: PEEK });
  client.defineCommand('rlHit', { lua: HIT });
  commands = client as Redis & RateLimitCommands;
  return commands;
}

/**
 * Redis key for one rule and subject. The subject is wrapped in {…} (a hash tag) so
 * all of a subject's keys live on the same node if Redis Cluster is ever used,
 * which multi-key scripts require.
 */
const windowKey = (rule: RateLimitRule, subject: string) =>
  redisKey('rl', `{${subject}}`, rule.name);

function toResult(reply: ScriptReply, rules: RateLimitRule[]): RateLimitResult {
  const [allowed, blockedIndex, retryMs, remaining, resetMs, limit] = reply;
  return {
    allowed: allowed === 1,
    blockedBy: blockedIndex > 0 ? rules[blockedIndex - 1]! : null,
    limit,
    remaining: Math.max(0, remaining),
    resetSec: Math.max(0, Math.ceil(resetMs / 1000)),
    retryAfterSec: allowed === 1 ? 0 : Math.max(1, Math.ceil(retryMs / 1000)),
  };
}

const ruleArgs = (rules: RateLimitRule[]) =>
  rules.flatMap((r) => [r.limit, r.windowSec * 1000]);

/**
 * Checks all rules and, only if every one has room, counts this request against all.
 * @param subject who is being limited, e.g. "user:<id>" or "ip:1.2.3.4".
 */
export async function consume(
  rules: RateLimitRule[],
  subject: string,
): Promise<RateLimitResult> {
  const keys = rules.map((r) => windowKey(r, subject));
  const reply = await redis().rlConsume(
    keys.length,
    ...keys,
    ...ruleArgs(rules),
    randomUUID(),
  );
  return toResult(reply, rules);
}

/** Checks the rules without counting anything (e.g. "is this IP locked out of login?"). */
export async function peek(
  rules: RateLimitRule[],
  subject: string,
): Promise<RateLimitResult> {
  const keys = rules.map((r) => windowKey(r, subject));
  const reply = await redis().rlPeek(keys.length, ...keys, ...ruleArgs(rules));
  return toResult(reply, rules);
}

/** Counts a hit without checking (e.g. a failed login attempt). */
export async function hit(
  rules: RateLimitRule[],
  subject: string,
): Promise<void> {
  const keys = rules.map((r) => windowKey(r, subject));
  await redis().rlHit(
    keys.length,
    ...keys,
    ...rules.map((r) => r.windowSec * 1000),
    randomUUID(),
  );
}

/** Clears the counters (e.g. after a successful login). */
export async function reset(
  rules: RateLimitRule[],
  subject: string,
): Promise<void> {
  const keys = rules.map((r) => windowKey(r, subject));
  if (keys.length > 0) await redis().del(...keys);
}

/**
 * Standard rate-limit response headers (IETF RateLimit header fields),
 * plus Retry-After when the request was refused.
 */
export function rateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  return {
    'ratelimit-limit': String(result.limit),
    'ratelimit-remaining': String(result.remaining),
    'ratelimit-reset': String(result.resetSec),
    ...(result.allowed ? {} : { 'retry-after': String(result.retryAfterSec) }),
  };
}
