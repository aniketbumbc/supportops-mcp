import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { env } from '@/env';
import { ApiError, getMe, type CurrentUser, type Role } from '@/lib/api';

/**
 * Session = the MCP server's login token, stored in an httpOnly cookie.
 * - httpOnly: browser JavaScript can never read it (XSS can't steal it).
 * - secure in production: only sent over HTTPS.
 * - sameSite=lax: not sent on cross-site POSTs (CSRF protection).
 * The token is already signed by the MCP server, so it needs no extra encryption here;
 * it is verified by the server on every call.
 */

export async function setSession(
  token: string,
  expiresAt: Date,
): Promise<void> {
  (await cookies()).set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(env.SESSION_COOKIE_NAME);
}

/** The raw token, for server code that calls the MCP server on the user's behalf. */
export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(env.SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * The logged-in user, verified with the MCP server (/auth/me), or null.
 * cache(): called many times while rendering one request, it asks the server once.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    return await getMe(token);
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) return null;
    throw error; // server down etc.: show an error page, don't pretend they're logged out
  }
});

/** For pages and actions that need a logged-in user. Redirects to login otherwise. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login?reason=expired');
  return user;
}

/** For pages only some roles may see (approvals, audit). */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.some((r) => user.roles.includes(r))) redirect('/chat?denied=1');
  return user;
}

/** Only relative paths inside this app, so ?next= can't send users to another site. */
export function safeNextPath(next: string | null | undefined): string {
  return next &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/login')
    ? next
    : '/chat';
}
