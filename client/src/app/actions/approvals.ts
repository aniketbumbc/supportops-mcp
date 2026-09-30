'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ApiError,
  approveRefund,
  rejectRefund,
  type Approval,
} from '@/lib/api';
import { getSessionToken, requireUser } from '@/lib/session';

/**
 * Approve / reject a refund request. The MCP server enforces every rule (who may
 * decide, not your own request, your approval limit, expiry) and re-checks the refund
 * before executing it; these actions only pass the decision on.
 */

export type ApprovalActionResult =
  | { ok: true; approval: Approval }
  | { ok: false; message: string };

const Ref = z.string().regex(/^APR-\d{4,}$/i, 'Unknown approval');

async function run(
  fn: (token: string) => Promise<Approval>,
): Promise<ApprovalActionResult> {
  await requireUser();
  const token = await getSessionToken();
  if (!token)
    return { ok: false, message: 'Your session has ended. Sign in again.' };
  try {
    const approval = await fn(token);
    // Refresh the list and the sidebar's pending badge.
    revalidatePath('/', 'layout');
    return { ok: true, approval };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function approveAction(
  ref: string,
  note: string,
): Promise<ApprovalActionResult> {
  const parsed = Ref.safeParse(ref);
  if (!parsed.success) return { ok: false, message: 'Unknown approval.' };
  const trimmed = note.trim();
  return run((token) =>
    approveRefund(token, parsed.data, trimmed || undefined),
  );
}

export async function rejectAction(
  ref: string,
  note: string,
): Promise<ApprovalActionResult> {
  const parsed = Ref.safeParse(ref);
  if (!parsed.success) return { ok: false, message: 'Unknown approval.' };
  const trimmed = note.trim();
  if (trimmed.length < 5)
    return {
      ok: false,
      message: 'Explain the rejection (at least 5 characters).',
    };
  return run((token) => rejectRefund(token, parsed.data, trimmed));
}
