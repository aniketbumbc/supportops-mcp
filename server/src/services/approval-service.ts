import { and, desc, eq, sql } from 'drizzle-orm';
import type { TicketingAdapter } from '../adapters/ticketing/ticketing-adapter';
import { db } from '../db/client';
import { approvals } from '../db/schema/index';
import { formatMoney } from '../domain/helper';
import { Errors } from '../errors/index';
import type { RequestContext } from '../gateway/context';
import type { EffectivePolicy } from '../policy/role-policy-store';
import type { RefundEvaluator } from './refund-evaluator';
import type { NormalizedRefundRequest, RefundService } from './refund-service';

/**
 * Refund approvals: the second person who says yes or no (docs/tool-contract.md §6).
 *
 * Rules: the approver's role can approve; the approver is not the requester; the amount
 * is within the approver's approval limit; the request hasn't expired (72h).
 * Approve re-checks the refund, then executes it. If execution fails after approval,
 * approving again resumes it; billing's idempotency key (approval:<ref>) guarantees a
 * single refund. Concurrent decisions are serialized by a row lock.
 */

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'executed',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

type ApprovalRow = typeof approvals.$inferSelect;

interface ApprovalPayload {
  request: NormalizedRefundRequest;
  paymentRef: string;
  approvalReasons: string[];
  requestedByRoles: string[];
  summary: string;
}

export interface ApprovalView {
  approvalRef: string;
  status: ApprovalStatus;
  customerRef: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  summary: string;
  approvalReasons: string[];
  reason: string;
  note: string;
  relatedTicketNumber: string | null;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  refundRef: string | null;
  /** Whether the caller could approve or reject it right now, and why not. */
  canDecide: boolean;
  cannotDecideReason: string | null;
}

const isExpired = (row: ApprovalRow) =>
  row.status === 'pending' && row.expiresAt.getTime() <= Date.now();

export class ApprovalService {
  constructor(
    private readonly evaluator: RefundEvaluator,
    private readonly refunds: RefundService,
    private readonly ticketing: TicketingAdapter,
  ) {}

  private whyCannotDecide(
    ctx: RequestContext,
    policy: EffectivePolicy,
    row: ApprovalRow,
  ): string | null {
    if (!policy.canApproveRefunds) return 'Your role cannot approve refunds.';
    if (row.requestedBy === ctx.userId)
      return 'You cannot decide your own request.';
    if (row.amountMinor > policy.approvalRefundLimitMinor) {
      return `Above your approval limit of ${formatMoney(policy.approvalRefundLimitMinor, row.currency)}.`;
    }
    if (
      row.status !== 'pending' &&
      !(row.status === 'approved' && !row.executedRefundRef)
    ) {
      return `Already ${row.status}.`;
    }
    return null;
  }

  private toView(
    ctx: RequestContext,
    policy: EffectivePolicy,
    row: ApprovalRow,
  ): ApprovalView {
    const payload = row.payload as unknown as ApprovalPayload;
    const status: ApprovalStatus = isExpired(row) ? 'expired' : row.status;
    const cannot =
      status === 'expired'
        ? 'Expired.'
        : this.whyCannotDecide(ctx, policy, row);
    return {
      approvalRef: row.approvalRef,
      status,
      customerRef: row.customerRef,
      invoiceNumber: row.invoiceNumber,
      amountMinor: row.amountMinor,
      currency: row.currency,
      summary: payload.summary,
      approvalReasons: payload.approvalReasons,
      reason: payload.request.reason,
      note: payload.request.note,
      relatedTicketNumber: payload.request.relatedTicketNumber ?? null,
      requestedBy: row.requestedBy,
      requestedAt: row.requestedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
      refundRef: row.executedRefundRef,
      canDecide: cannot === null,
      cannotDecideReason: cannot,
    };
  }

  /** Approvals in the caller's tenant, newest first. Default: pending ones. */
  async list(
    ctx: RequestContext,
    policy: EffectivePolicy,
    status: ApprovalStatus | 'all' = 'pending',
  ): Promise<ApprovalView[]> {
    if (!policy.canApproveRefunds)
      throw Errors.permissionDenied('Your role cannot view approvals.');
    await this.expireOld(ctx.tenantId);
    const rows = await db
      .select()
      .from(approvals)
      .where(
        status === 'all'
          ? eq(approvals.tenantId, ctx.tenantId)
          : and(
              eq(approvals.tenantId, ctx.tenantId),
              eq(approvals.status, status),
            ),
      )
      .orderBy(desc(approvals.requestedAt))
      .limit(100);
    return rows.map((r) => this.toView(ctx, policy, r));
  }

  /** Approves and executes the refund. Resumes execution if a previous approve failed midway. */
  async approve(
    ctx: RequestContext,
    policy: EffectivePolicy,
    approvalRef: string,
    note?: string,
  ): Promise<ApprovalView> {
    // 1. Lock, check the rules, re-check the refund, mark approved. One decision wins.
    const row = await db.transaction(async (tx) => {
      const current = await this.lock(tx, ctx, approvalRef);
      // Approved but not yet executed (execution failed midway): only the approver who
      // approved it may resume. Anyone else sees that it's already decided.
      if (current.status === 'approved' && !current.executedRefundRef) {
        if (current.decidedBy === ctx.userId) return current;
        throw Errors.conflict(
          `Approval ${current.approvalRef} was already approved by ${current.decidedBy}.`,
        );
      }
      this.assertDecidable(ctx, policy, current);

      // Still a valid refund? (Already refunded elsewhere, customer suspended, ...)
      // The approver's approval replaces the approval step, so "request_approval" is fine.
      const payload = current.payload as unknown as ApprovalPayload;
      await this.evaluator.evaluate(ctx, policy, payload.request);

      const [updated] = await tx
        .update(approvals)
        .set({
          status: 'approved',
          decidedBy: ctx.userId,
          decidedAt: new Date(),
          decisionNote: note?.trim() || null,
        })
        .where(eq(approvals.id, current.id))
        .returning();
      return updated!;
    });

    // 2. Execute outside the lock. Billing key approval:<ref> → never two refunds.
    const payload = row.payload as unknown as ApprovalPayload;
    const decision = await this.evaluator
      .evaluate(ctx, policy, payload.request)
      .catch(async (error) => {
        // Re-check failed after approval (e.g. refunded meanwhile): record it, don't refund.
        await db
          .update(approvals)
          .set({
            decisionNote: `Approved but not executed: ${(error as Error).message}`,
          })
          .where(eq(approvals.id, row.id));
        throw error;
      });
    const refund = await this.refunds.executeRefund(
      ctx,
      payload.request,
      decision,
      `${ctx.tenantId}:approval:${row.approvalRef}`,
      {
        approval_ref: row.approvalRef,
        requested_by: row.requestedBy,
        approved_by: ctx.userId,
      },
    );

    const [done] = await db
      .update(approvals)
      .set({ status: 'executed', executedRefundRef: refund.refundRef })
      .where(eq(approvals.id, row.id))
      .returning();
    ctx.log.info(
      { approvalRef, refundRef: refund.refundRef },
      'Approval executed',
    );
    return this.toView(ctx, policy, done!);
  }

  /** Rejects a pending request. A note explaining why is required. */
  async reject(
    ctx: RequestContext,
    policy: EffectivePolicy,
    approvalRef: string,
    note: string,
  ): Promise<ApprovalView> {
    const reason = note.trim();
    if (reason.length < 5 || reason.length > 500) {
      throw Errors.validation(
        'note must be 5 to 500 characters, explaining the rejection',
        {
          field: 'note',
        },
      );
    }
    const row = await db.transaction(async (tx) => {
      const current = await this.lock(tx, ctx, approvalRef);
      this.assertDecidable(ctx, policy, current);
      if (current.status !== 'pending')
        throw Errors.conflict(
          `Approval ${approvalRef} is already ${current.status}.`,
        );
      const [updated] = await tx
        .update(approvals)
        .set({
          status: 'rejected',
          decidedBy: ctx.userId,
          decidedAt: new Date(),
          decisionNote: reason,
        })
        .where(eq(approvals.id, current.id))
        .returning();
      return updated!;
    });

    const payload = row.payload as unknown as ApprovalPayload;
    if (payload.request.relatedTicketNumber) {
      await this.ticketing
        .addComment(ctx, payload.request.relatedTicketNumber, {
          body: `Refund approval ${approvalRef} rejected: ${reason}`,
          authorType: 'system',
          isInternal: true,
        })
        .catch((error) =>
          ctx.log.warn({ err: error }, 'Could not note rejection on ticket'),
        );
    }
    ctx.log.info({ approvalRef }, 'Approval rejected');
    return this.toView(ctx, policy, row);
  }

  // ─── helpers ───────────────────────────────────────────

  private async lock(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    ctx: RequestContext,
    approvalRef: string,
  ) {
    const ref = approvalRef.trim().toUpperCase();
    const [row] = await tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.approvalRef, ref),
          eq(approvals.tenantId, ctx.tenantId),
        ),
      )
      .for('update');
    if (!row) throw Errors.notFound('Approval', ref);
    // (Expired rows are marked in the database by expireOld when approvals are listed.)
    if (isExpired(row)) {
      throw Errors.conflict(
        `Approval ${ref} expired on ${row.expiresAt.toISOString().slice(0, 16)}. Request a new refund.`,
      );
    }
    return row;
  }

  private assertDecidable(
    ctx: RequestContext,
    policy: EffectivePolicy,
    row: ApprovalRow,
  ): void {
    if (row.status !== 'pending') {
      throw Errors.conflict(
        `Approval ${row.approvalRef} is already ${row.status}.`,
        {
          refund_ref: row.executedRefundRef,
        },
      );
    }
    const why = this.whyCannotDecide(ctx, policy, row);
    if (why) throw Errors.permissionDenied(why);
  }

  /** Marks timed-out pending requests as expired (lazily, when approvals are listed). */
  private async expireOld(tenantId: string): Promise<void> {
    await db
      .update(approvals)
      .set({ status: 'expired' })
      .where(
        and(
          eq(approvals.tenantId, tenantId),
          eq(approvals.status, 'pending'),
          sql`${approvals.expiresAt} <= now()`,
        ),
      );
  }
}
