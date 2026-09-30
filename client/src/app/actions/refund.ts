'use server';

import { z } from 'zod';
import { withUserMcp, type ToolError } from '@/lib/mcp';
import { requireUser } from '@/lib/session';

/**
 * The human confirmation of a refund preview. This is the ONLY path in the web app
 * that sends a confirmation_token: the model can't (it never gets the field or the
 * token). The server re-checks everything: token signature, expiry, single use, that
 * it belongs to this user, that the details are exactly the previewed ones, and the
 * refund policy again.
 */

const ConfirmInput = z.object({
  customer_ref: z.string().min(1).max(20),
  invoice_number: z.string().min(1).max(30),
  amount_minor: z.number().int().positive(),
  reason: z.string().min(1).max(40),
  note: z.string().min(1).max(1000),
  related_ticket_number: z.string().max(20).optional(),
  confirmation_token: z.string().min(20).max(4000),
});
export type ConfirmRefundInput = z.infer<typeof ConfirmInput>;

export type ConfirmRefundResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: Pick<ToolError, 'code' | 'message'> };

export async function confirmRefundAction(
  input: ConfirmRefundInput,
): Promise<ConfirmRefundResult> {
  await requireUser();
  const parsed = ConfirmInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'This refund preview is incomplete. Ask for a new one.',
      },
    };
  }

  const result = await withUserMcp((mcp) =>
    mcp.callTool('issue_refund', parsed.data),
  );
  if (!result.ok)
    return {
      ok: false,
      error: { code: result.error.code, message: result.error.message },
    };
  return { ok: true, data: result.structured ?? {} };
}
