import { createHash } from 'node:crypto';
import { AUTH_LIMITS } from '../policy/rate-limits';
import { hit, peek, reset } from './rate-limiter';

/**
 * Brute-force protection for /auth/login, stored in Redis: survives restarts and
 * is shared by every server instance.
 * Only FAILED attempts are counted; a successful login clears the email counter.
 *   - per email + IP: guessing one account's password
 *   - per IP:         trying many accounts
 * Emails are hashed in Redis keys, so Redis never holds a list of email addresses.
 */

const emailHash = (email: string) =>
  createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);

const emailIpSubject = (ip: string, email: string) =>
  `login:ip:${ip}:email:${emailHash(email)}`;
const ipSubject = (ip: string) => `login:ip:${ip}`;

/** Seconds until this IP/email may try again, or 0 if allowed now. */
export async function loginRetryAfter(
  ip: string,
  email: string,
): Promise<number> {
  const [perEmail, perIp] = await Promise.all([
    peek([AUTH_LIMITS.loginPerEmailAndIp], emailIpSubject(ip, email)),
    peek([AUTH_LIMITS.loginPerIp], ipSubject(ip)),
  ]);
  return Math.max(perEmail.retryAfterSec, perIp.retryAfterSec);
}

export async function recordLoginFailure(
  ip: string,
  email: string,
): Promise<void> {
  await Promise.all([
    hit([AUTH_LIMITS.loginPerEmailAndIp], emailIpSubject(ip, email)),
    hit([AUTH_LIMITS.loginPerIp], ipSubject(ip)),
  ]);
}

/** After a successful login. The per-IP counter is kept, so one good account can't unlock guessing others. */
export async function clearLoginFailures(
  ip: string,
  email: string,
): Promise<void> {
  await reset([AUTH_LIMITS.loginPerEmailAndIp], emailIpSubject(ip, email));
}
