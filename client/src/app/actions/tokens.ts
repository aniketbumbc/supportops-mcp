'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ApiError,
  createToken,
  revokeToken,
  type PersonalAccessToken,
} from '@/lib/api';
import { getSessionToken, requireUser } from '@/lib/session';

/**
 * Personal access tokens for MCP clients (Cursor, Claude Code...).
 * The full token is returned once, to show the user; it is never stored or logged here.
 */

export type CreateTokenResult =
  | { ok: true; token: string; pat: PersonalAccessToken }
  | { ok: false; message: string };

const CreateInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the token a name')
    .max(100, 'Keep the name under 100 characters'),
  days: z.union([z.literal(7), z.literal(30), z.literal(60), z.literal(90)]),
});

async function sessionToken(): Promise<string> {
  await requireUser();
  const token = await getSessionToken();
  if (!token)
    throw new ApiError(
      401,
      'UNAUTHENTICATED',
      'Your session has ended. Sign in again.',
    );
  return token;
}

export async function createTokenAction(
  name: string,
  days: number,
): Promise<CreateTokenResult> {
  const parsed = CreateInput.safeParse({ name, days });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]!.message };
  try {
    const created = await createToken(await sessionToken(), {
      name: parsed.data.name,
      expiresInDays: parsed.data.days,
    });
    revalidatePath('/tokens');
    return { ok: true, token: created.token, pat: created.pat };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function revokeTokenAction(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return { ok: false, message: 'Unknown token.' };
  try {
    await revokeToken(await sessionToken(), id);
    revalidatePath('/tokens');
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, message: error.message };
    throw error;
  }
}
