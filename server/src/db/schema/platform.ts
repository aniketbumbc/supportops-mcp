/**
 * "platform" schema: data owned by the MCP server itself.
 * Audit log, refund approvals and role policies. Never business records.
 */
import {
  bigserial,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const platformSchema = pgSchema('platform');

export const auditActionType = platformSchema.enum('audit_action_type', [
  'read',
  'write',
]);
export const auditOutcome = platformSchema.enum('audit_outcome', [
  'success',
  'denied',
  'error',
  'rate_limited',
  'pending_approval',
  'cancelled',
]);
export const approvalType = platformSchema.enum('approval_type', ['refund']);
export const approvalStatus = platformSchema.enum('approval_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
  'executed',
]);

export const approvalRefSeq = platformSchema.sequence('approval_ref_seq', {
  startWith: 1,
});

/** Refund limits and tool access per role. Editable without code changes. */
export const rolePolicies = platformSchema.table('role_policies', {
  role: text('role').primaryKey(),
  description: text('description').notNull(),
  allowedTools: text('allowed_tools').array().notNull(),
  directRefundLimitMinor: integer('direct_refund_limit_minor')
    .notNull()
    .default(0),
  approvalRefundLimitMinor: integer('approval_refund_limit_minor')
    .notNull()
    .default(0),
  canApproveRefunds: boolean('can_approve_refunds').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Append-only record of every tool call, including denials. */
export const auditLog = platformSchema.table(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    correlationId: text('correlation_id').notNull(),
    tenantId: text('tenant_id').notNull().default('default'),
    userId: text('user_id').notNull(),
    roles: text('roles').array().notNull(),
    toolName: text('tool_name').notNull(),
    actionType: auditActionType('action_type').notNull(),
    arguments: jsonb('arguments')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    outcome: auditOutcome('outcome').notNull(),
    resultSummary: jsonb('result_summary').$type<Record<string, unknown>>(),
    errorCode: text('error_code'),
    durationMs: integer('duration_ms').notNull(),
  },
  (t) => [
    index('audit_occurred_idx').on(t.occurredAt),
    index('audit_user_idx').on(t.userId),
    index('audit_tool_idx').on(t.toolName),
    index('audit_correlation_idx').on(t.correlationId),
  ],
);

/** Refunds above a role's direct limit wait here for a second person. */
export const approvals = platformSchema.table(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    approvalRef: text('approval_ref').notNull().unique(),
    tenantId: text('tenant_id').notNull().default('default'),
    type: approvalType('type').notNull(),
    status: approvalStatus('status').notNull().default('pending'),
    requestedBy: text('requested_by').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    customerRef: text('customer_ref').notNull(),
    invoiceNumber: text('invoice_number').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    idempotencyKey: text('idempotency_key').unique(),
    executedRefundRef: text('executed_refund_ref'),
  },
  (t) => [
    index('approvals_status_idx').on(t.status),
    index('approvals_requested_by_idx').on(t.requestedBy),
  ],
);
