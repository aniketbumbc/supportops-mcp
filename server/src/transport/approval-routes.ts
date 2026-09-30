import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createRequestContext,
  resolveIdentity,
  type RequestContext,
} from '../gateway/context';
import {
  getEffectivePolicy,
  type EffectivePolicy,
} from '../policy/role-policy-store';
import {
  APPROVAL_STATUSES,
  type ApprovalView,
} from '../services/approval-service';
import type { Services } from '../services/index';
import { registerHttpErrorHandler } from './http-errors';

/**
 * Approval endpoints for the frontend (approvers only):
 *   GET  /approvals?status=pending|approved|rejected|expired|executed|all
 *   POST /approvals/:ref/approve   { note? }
 *   POST /approvals/:ref/reject    { note }
 */

const toJson = (a: ApprovalView) => ({
  approval_ref: a.approvalRef,
  status: a.status,
  customer_ref: a.customerRef,
  invoice_number: a.invoiceNumber,
  amount_minor: a.amountMinor,
  currency: a.currency,
  summary: a.summary,
  approval_reasons: a.approvalReasons,
  reason: a.reason,
  note: a.note,
  related_ticket_number: a.relatedTicketNumber,
  requested_by: a.requestedBy,
  requested_at: a.requestedAt,
  expires_at: a.expiresAt,
  decided_by: a.decidedBy,
  decided_at: a.decidedAt,
  decision_note: a.decisionNote,
  refund_ref: a.refundRef,
  can_decide: a.canDecide,
  cannot_decide_reason: a.cannotDecideReason,
  requested_by_name: a.requestedByName,
});

declare module 'fastify' {
  interface FastifyRequest {
    caller?: { ctx: RequestContext; policy: EffectivePolicy };
  }
}

export async function approvalRoutes(
  app: FastifyInstance,
  deps: { services: Services },
) {
  const { approvals } = deps.services;
  registerHttpErrorHandler(app);

  /** Every approval route needs a verified caller and their permissions. */
  app.addHook('preHandler', async (request: FastifyRequest) => {
    const ctx = createRequestContext(
      request.id,
      await resolveIdentity(request.headers),
    );
    request.caller = { ctx, policy: await getEffectivePolicy(ctx.roles) };
  });

  app.get('/approvals', async (request) => {
    const { status } = z
      .object({
        status: z.enum([...APPROVAL_STATUSES, 'all']).default('pending'),
      })
      .parse(request.query);
    const { ctx, policy } = request.caller!;
    return {
      approvals: (await approvals.list(ctx, policy, status)).map(toJson),
    };
  });

  app.post<{ Params: { ref: string } }>(
    '/approvals/:ref/approve',
    async (request) => {
      const { note } = z
        .object({ note: z.string().max(500).optional() })
        .parse(request.body ?? {});
      const { ctx, policy } = request.caller!;
      return toJson(
        await approvals.approve(ctx, policy, request.params.ref, note),
      );
    },
  );

  app.post<{ Params: { ref: string } }>(
    '/approvals/:ref/reject',
    async (request) => {
      const { note } = z
        .object({ note: z.string().max(500) })
        .parse(request.body ?? {});
      const { ctx, policy } = request.caller!;
      return toJson(
        await approvals.reject(ctx, policy, request.params.ref, note),
      );
    },
  );
}
