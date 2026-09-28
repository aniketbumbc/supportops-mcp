import { sql } from 'drizzle-orm';
import type { BillingAdapter } from '../adapters/billing/billing-adapter';
import type { TicketingAdapter } from '../adapters/ticketing/ticketing-adapter';
import { db } from '../db/client';
import { formatRef } from '../db/refs';
import { approvals } from '../db/schema/index';
import { formatMoney } from '../domain/helper';
import { assertRef } from '../domain/refs';
import { Errors } from '../errors/index';
import {
  consumeConfirmation,
  createConfirmation,
  verifyConfirmation,
} from '../gateway/confirmation';
import type { RequestContext } from '../gateway/context';
import { idempotencyKeyFor, withIdempotency } from '../gateway/idempotency';
import type { EffectivePolicy } from '../policy/role-policy-store';
import type {
  ApprovalReason,
  RefundDecision,
  RefundEvaluator,
} from './refund-evaluator';

/**
 * issue_refund, end to end (docs/tool-contract.md §5.7 and §6).
 *
 * Without a confirmation token → PREVIEW: evaluate policy, return what would happen
 *   plus a 5-minute confirmation token. Nothing changes.
 * With a token → CONFIRM: verify the token, re-check policy (things may have changed),
 *   consume the token inside an idempotent block, then either execute the refund at
 *   billing or create an approval request. Links the ticket if one was given.
 */

export const REFUND_REASONS = [
  'duplicate_charge',
  'service_issue',
  'billing_error',
  'goodwill',
  'other',
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** Pending approvals expire after this long (docs/tool-contract.md §7). */
export const APPROVAL_TTL_HOURS = 72;

export interface RefundInput {
  customerRef: string;
  invoiceNumber: string;
  amountMinor: number;
  reason: RefundReason;
  note: string;
  relatedTicketNumber?: string;
  confirmationToken?: string;
}

export interface RefundResult {
  status: 'requires_confirmation' | 'completed' | 'pending_approval';
  /** What confirming will do (preview) or did (confirm). */
  decision: RefundDecision['action'];
  approvalReasons: ApprovalReason[];
  customerRef: string;
  invoiceNumber: string;
  paymentRef: string;
  amountMinor: number;
  currency: string;
  confirmationToken: string | null;
  confirmationExpiresAt: string | null;
  refundRef: string | null;
  approvalRef: string | null;
  ticketNoteAdded: boolean;
  message: string;
  replayed: boolean;
}

/** What the confirmation token carries from the preview. */
interface PreviewDecision {
  action: RefundDecision['action'];
  paymentRef: string;
}

/** Normalized request: the exact thing the user confirms (and the token is bound to). */
export type NormalizedRefundRequest = Omit<RefundInput, 'confirmationToken'>;

export class RefundService {
  constructor(
    private readonly evaluator: RefundEvaluator,
    private readonly billing: BillingAdapter,
    private readonly ticketing: TicketingAdapter,
  ) {}

  private normalize(input: RefundInput): NormalizedRefundRequest {
    if (!REFUND_REASONS.includes(input.reason)) {
      throw Errors.validation(
        `reason must be one of ${REFUND_REASONS.join(', ')}`,
        {
          field: 'reason',
        },
      );
    }
    const note = input.note.trim();
    if (note.length < 10 || note.length > 1000) {
      throw Errors.validation(
        'note must be 10 to 1000 characters, explaining the refund',
        {
          field: 'note',
        },
      );
    }
    return {
      customerRef: assertRef('customer', input.customerRef, 'customer_ref'),
      invoiceNumber: assertRef(
        'invoice',
        input.invoiceNumber,
        'invoice_number',
      ),
      amountMinor: input.amountMinor,
      reason: input.reason,
      note,
      relatedTicketNumber:
        input.relatedTicketNumber !== undefined
          ? assertRef(
              'ticket',
              input.relatedTicketNumber,
              'related_ticket_number',
            )
          : undefined,
    };
  }

  async issueRefund(
    ctx: RequestContext,
    policy: EffectivePolicy,
    input: RefundInput,
  ): Promise<RefundResult> {
    const request = this.normalize(input);
    return input.confirmationToken
      ? this.confirm(ctx, policy, request, input.confirmationToken)
      : this.preview(ctx, policy, request);
  }

  // ─── Step 1: preview ───────────────────────────────────
  private async preview(
    ctx: RequestContext,
    policy: EffectivePolicy,
    request: NormalizedRefundRequest,
  ): Promise<RefundResult> {
    const decision = await this.evaluator.evaluate(ctx, policy, request);
    const confirmation = await createConfirmation(
      ctx,
      'issue_refund',
      request,
      {
        action: decision.action,
        paymentRef: decision.paymentRef,
      } satisfies PreviewDecision,
    );

    return {
      ...this.base(decision),
      status: 'requires_confirmation',
      confirmationToken: confirmation.token,
      confirmationExpiresAt: confirmation.expiresAt.toISOString(),
      message:
        `${decision.summary} Nothing has happened yet: show this to the user and, only if they ` +
        'agree, call issue_refund again with the same details plus confirmation_token.',
      replayed: false,
    };
  }

  // ─── Step 2: confirm ───────────────────────────────────
  private async confirm(
    ctx: RequestContext,
    policy: EffectivePolicy,
    request: NormalizedRefundRequest,
    token: string,
  ): Promise<RefundResult> {
    // Reject bad tokens early; the token is only used up inside the idempotent block.
    const confirmation = await verifyConfirmation<PreviewDecision>(
      ctx,
      token,
      'issue_refund',
      request,
    );
    const args = { ...request, paymentRef: confirmation.decision.paymentRef };

    const { result, replayed } = await withIdempotency(
      ctx,
      'issue_refund',
      args,
      async () => {
        // Re-check: another refund, a suspension or a policy change may have happened.
        const decision = await this.evaluator.evaluate(ctx, policy, request);
        if (
          decision.action !== confirmation.decision.action ||
          decision.paymentRef !== confirmation.decision.paymentRef
        ) {
          throw Errors.conflict(
            'The refund situation changed since the preview. Get a new preview and confirm again.',
            {
              previewed: confirmation.decision,
              now: { action: decision.action, paymentRef: decision.paymentRef },
            },
          );
        }
        await consumeConfirmation(confirmation);

        const key = idempotencyKeyFor(ctx, 'issue_refund', args);
        return decision.action === 'execute'
          ? this.executeRefund(ctx, request, decision, key, {})
          : this.requestApproval(ctx, request, decision, key);
      },
    );

    return { ...result, replayed };
  }

  /**
   * Performs the refund at billing and notes it on the linked ticket.
   * Public so an approval (Step 9) can execute an approved request.
   * `idempotencyKey` goes to billing: the same key never refunds twice there.
   */
  async executeRefund(
    ctx: RequestContext,
    request: NormalizedRefundRequest,
    decision: RefundDecision,
    idempotencyKey: string,
    metadata: Record<string, string>,
  ): Promise<RefundResult> {
    const refund = await this.billing.createRefund(
      ctx,
      {
        paymentRef: decision.paymentRef,
        amountMinor: decision.amountMinor,
        reason: request.reason,
        metadata: {
          executed_by: ctx.userId,
          note: request.note,
          ticket: request.relatedTicketNumber ?? null,
          ...metadata,
        },
      },
      idempotencyKey,
    );

    const money = formatMoney(refund.amountMinor, refund.currency);
    const ticketNoteAdded = await this.noteOnTicket(
      ctx,
      request.relatedTicketNumber,
      `Refund ${refund.refundRef} issued: ${money} from ${decision.invoiceNumber} ` +
        `(payment ${decision.paymentRef}). Reason: ${request.reason}. ${request.note}`,
    );

    ctx.log.info(
      {
        refundRef: refund.refundRef,
        invoice: decision.invoiceNumber,
        amountMinor: refund.amountMinor,
      },
      'Refund executed',
    );
    return {
      ...this.base(decision),
      status: 'completed',
      refundRef: refund.refundRef,
      ticketNoteAdded,
      message: `Refunded ${money} to ${decision.customer.name} (${refund.refundRef}).`,
      replayed: false,
    };
  }

  /** Records a refund that needs a second person. Nothing is refunded yet. */
  private async requestApproval(
    ctx: RequestContext,
    request: NormalizedRefundRequest,
    decision: RefundDecision,
    idempotencyKey: string,
  ): Promise<RefundResult> {
    const approvalRef = await db.transaction(async (tx) => {
      const [{ next } = { next: 0 }] = await tx.execute<{ next: number }>(
        sql`select nextval('platform.approval_ref_seq')::int as next`,
      );
      const ref = formatRef('APR', next);
      await tx.insert(approvals).values({
        approvalRef: ref,
        tenantId: ctx.tenantId,
        type: 'refund',
        status: 'pending',
        requestedBy: ctx.userId,
        expiresAt: new Date(Date.now() + APPROVAL_TTL_HOURS * 60 * 60 * 1000),
        customerRef: decision.customer.customerRef,
        invoiceNumber: decision.invoiceNumber,
        amountMinor: decision.amountMinor,
        currency: decision.currency,
        payload: {
          request,
          paymentRef: decision.paymentRef,
          approvalReasons: decision.approvalReasons,
          requestedByRoles: ctx.roles,
          summary: decision.summary,
        },
        idempotencyKey,
      });
      return ref;
    });

    const money = formatMoney(decision.amountMinor, decision.currency);
    const ticketNoteAdded = await this.noteOnTicket(
      ctx,
      request.relatedTicketNumber,
      `Refund approval ${approvalRef} requested: ${money} from ${decision.invoiceNumber}. ` +
        `Waiting for an approver. ${request.note}`,
    );

    ctx.log.info(
      { approvalRef, amountMinor: decision.amountMinor },
      'Refund approval requested',
    );
    return {
      ...this.base(decision),
      status: 'pending_approval',
      approvalRef,
      ticketNoteAdded,
      message:
        `Approval ${approvalRef} requested for ${money} to ${decision.customer.name}. ` +
        `Nothing is refunded until an approver accepts it (within ${APPROVAL_TTL_HOURS} hours).`,
      replayed: false,
    };
  }

  /** Best effort: a failed ticket note must never undo or hide a completed refund. */
  private async noteOnTicket(
    ctx: RequestContext,
    ticketNumber: string | undefined,
    body: string,
  ): Promise<boolean> {
    if (!ticketNumber) return false;
    try {
      await this.ticketing.addComment(ctx, ticketNumber, {
        body,
        authorType: 'system',
        isInternal: true,
      });
      return true;
    } catch (error) {
      ctx.log.warn(
        { err: error, ticketNumber },
        'Could not add refund note to ticket',
      );
      return false;
    }
  }

  private base(decision: RefundDecision) {
    return {
      decision: decision.action,
      approvalReasons: decision.approvalReasons,
      customerRef: decision.customer.customerRef,
      invoiceNumber: decision.invoiceNumber,
      paymentRef: decision.paymentRef,
      amountMinor: decision.amountMinor,
      currency: decision.currency,
      confirmationToken: null,
      confirmationExpiresAt: null,
      refundRef: null,
      approvalRef: null,
      ticketNoteAdded: false,
    };
  }
}
