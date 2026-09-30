import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionToken } from '@/lib/session';
import { McpConnectionError, withMcp, type McpSession } from './mcp-client';

/**
 * withMcp for the current logged-in user (token from the session cookie).
 * An expired or revoked session sends the user to the login page.
 */
export async function withUserMcp<T>(
  fn: (mcp: McpSession) => Promise<T>,
): Promise<T> {
  const token = await getSessionToken();
  if (!token) redirect('/login?reason=expired');
  try {
    return await withMcp(token, fn);
  } catch (error) {
    if (
      error instanceof McpConnectionError &&
      error.kind === 'unauthenticated'
    ) {
      redirect('/login?reason=expired');
    }
    throw error;
  }
}
