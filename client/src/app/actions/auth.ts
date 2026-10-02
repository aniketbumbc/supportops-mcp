'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError, demoLogin, login } from '@/lib/api';
import { clearSession, safeNextPath, setSession } from '@/lib/session';

export interface LoginState {
  error: string | null;
  email: string;
}

const LoginForm = z.object({
  email: z.string().trim().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
});

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginForm.safeParse(Object.fromEntries(formData));
  const email = String(formData.get('email') ?? '');
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, email };

  try {
    const result = await login(parsed.data.email, parsed.data.password);
    await setSession(result.accessToken, result.expiresAt);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429) {
        const minutes = Math.ceil((error.retryAfterSec ?? 900) / 60);
        return {
          error: `Too many failed attempts. Try again in about ${minutes} minutes.`,
          email,
        };
      }
      if (error.status === 401)
        return { error: 'Invalid email or password.', email };
      return { error: error.message, email };
    }
    throw error;
  }
  // redirect() must be outside try/catch: it works by throwing.
  redirect(safeNextPath(parsed.data.next));
}

export interface DemoState {
  error: string | null;
}

/**
 * The visitor's IP. Caddy is the only way in (the web container has no public port)
 * and it sets X-Forwarded-For, so the last entry is the address Caddy saw.
 */
async function visitorIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return forwarded || h.get('x-real-ip')?.trim() || '127.0.0.1';
}

export async function demoLoginAction(): Promise<DemoState> {
  try {
    const result = await demoLogin(await visitorIp());
    await setSession(result.accessToken, result.expiresAt);
  } catch (error) {
    if (error instanceof ApiError) {
      // The server's message already says "Demo available again in N minutes."
      if (error.status === 429) return { error: error.message };
      if (error.status === 404)
        return { error: 'The demo is switched off right now.' };
      if (error.status === 0) return { error: error.message };
      return { error: 'Could not start the demo. Try again shortly.' };
    }
    throw error;
  }
  redirect('/chat');
}

/** Called by the demo banner when time is up. */
export async function endDemoAction(): Promise<void> {
  await clearSession();
  redirect('/login?reason=demo-ended');
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect('/login');
}
