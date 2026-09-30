import 'server-only';
import { z } from 'zod';
import { apiFetch } from './http';

export const AUDIT_OUTCOMES = [
  'success',
  'denied',
  'error',
  'rate_limited',
  'pending_approval',
  'cancelled',
] as const;

const Entry = z
  .object({
    id: z.number(),
    occurred_at: z.string(),
    correlation_id: z.string(),
    user_id: z.string(),
    user_name: z.string().nullable(),
    user_email: z.string().nullable(),
    roles: z.array(z.string()),
    auth_method: z.string(),
    token_name: z.string().nullable(),
    tool_name: z.string(),
    action_type: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    outcome: z.string(),
    result_summary: z.record(z.string(), z.unknown()).nullable(),
    error_code: z.string().nullable(),
    duration_ms: z.number(),
  })
  .transform((e) => ({
    id: e.id,
    occurredAt: e.occurred_at,
    correlationId: e.correlation_id,
    userId: e.user_id,
    userName: e.user_name,
    userEmail: e.user_email,
    roles: e.roles,
    authMethod: e.auth_method,
    tokenName: e.token_name,
    toolName: e.tool_name,
    actionType: e.action_type,
    arguments: e.arguments,
    outcome: e.outcome,
    resultSummary: e.result_summary,
    errorCode: e.error_code,
    durationMs: e.duration_ms,
  }));
export type AuditEntry = z.infer<typeof Entry>;

export interface AuditFilters {
  user?: string;
  tool?: string;
  outcome?: string;
  source?: string;
  from?: string;
  to?: string;
  correlation_id?: string;
  before?: string;
}

export const listAudit = (token: string, filters: AuditFilters) =>
  apiFetch('/audit', {
    token,
    query: { ...filters, limit: '50' },
    schema: z
      .object({ entries: z.array(Entry), next_cursor: z.number().nullable() })
      .transform((r) => ({ entries: r.entries, nextCursor: r.next_cursor })),
  });
