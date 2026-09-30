import 'server-only';
import { z } from 'zod';
import { apiFetch } from './http';

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'executed',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

const ApprovalJson = z
  .object({
    approval_ref: z.string(),
    status: z.enum(APPROVAL_STATUSES),
    customer_ref: z.string(),
    invoice_number: z.string(),
    amount_minor: z.number().int(),
    currency: z.string(),
    summary: z.string(),
    approval_reasons: z.array(z.string()),
    reason: z.string(),
    note: z.string(),
    related_ticket_number: z.string().nullable(),
    requested_by: z.string(),
    requested_at: z.string(),
    expires_at: z.string(),
    decided_by: z.string().nullable(),
    decided_at: z.string().nullable(),
    decision_note: z.string().nullable(),
    refund_ref: z.string().nullable(),
    can_decide: z.boolean(),
    cannot_decide_reason: z.string().nullable(),
    requested_by_name: z.string().nullable().optional(),
  })
  .transform((a) => ({
    approvalRef: a.approval_ref,
    status: a.status,
    customerRef: a.customer_ref,
    invoiceNumber: a.invoice_number,
    amountMinor: a.amount_minor,
    currency: a.currency,
    summary: a.summary,
    approvalReasons: a.approval_reasons,
    reason: a.reason,
    note: a.note,
    relatedTicketNumber: a.related_ticket_number,
    requestedBy: a.requested_by,
    requestedAt: a.requested_at,
    expiresAt: a.expires_at,
    decidedBy: a.decided_by,
    decidedAt: a.decided_at,
    decisionNote: a.decision_note,
    refundRef: a.refund_ref,
    canDecide: a.can_decide,
    cannotDecideReason: a.cannot_decide_reason,
    requestedByName: a.requested_by_name,
  }));
export type Approval = z.infer<typeof ApprovalJson>;

export const listApprovals = (
  token: string,
  status: ApprovalStatus | 'all' = 'pending',
) =>
  apiFetch('/approvals', {
    token,
    query: { status },
    schema: z
      .object({ approvals: z.array(ApprovalJson) })
      .transform((r) => r.approvals),
  });

export const approveRefund = (token: string, ref: string, note?: string) =>
  apiFetch(`/approvals/${encodeURIComponent(ref)}/approve`, {
    method: 'POST',
    token,
    body: { note },
    schema: ApprovalJson,
  });

export const rejectRefund = (token: string, ref: string, note: string) =>
  apiFetch(`/approvals/${encodeURIComponent(ref)}/reject`, {
    method: 'POST',
    token,
    body: { note },
    schema: ApprovalJson,
  });
