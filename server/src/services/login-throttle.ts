/**
 * Basic brute-force protection for /auth/login, kept in memory.
 * Counts FAILED attempts per key in a fixed window; a successful login clears it.
 * Phase 5 moves this to Redis so limits survive restarts and work across instances.
 */

interface Window {
  failures: number;
  resetAt: number;
}

export interface ThrottleRule {
  maxFailures: number;
  windowMs: number;
}

export const LOGIN_RULES = {
  /** Same email from the same IP: guessing one account's password. */
  perEmailAndIp: { maxFailures: 5, windowMs: 15 * 60_000 },
  /** Same IP, any email: trying many accounts. */
  perIp: { maxFailures: 20, windowMs: 15 * 60_000 },
};
const windows = new Map<string, Window>();
const MAX_KEYS = 10_000;

function current(key: string, rule: ThrottleRule): Window {
  const now = Date.now();
  const existing = windows.get(key);
  if (existing && existing.resetAt > now) return existing;
  const fresh = { failures: 0, resetAt: now + rule.windowMs };
  if (windows.size >= MAX_KEYS) windows.clear();
  windows.set(key, fresh);
  return fresh;
}

/** Seconds until the caller may try again, or 0 if allowed now. */
export function retryAfterSeconds(key: string, rule: ThrottleRule): number {
  const w = current(key, rule);
  return w.failures >= rule.maxFailures
    ? Math.ceil((w.resetAt - Date.now()) / 1000)
    : 0;
}

export function recordFailure(key: string, rule: ThrottleRule): void {
  current(key, rule).failures += 1;
}

export function clearFailures(key: string): void {
  windows.delete(key);
}
