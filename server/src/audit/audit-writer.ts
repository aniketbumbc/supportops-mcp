import { db } from '../db/client';
import { auditLog } from '../db/schema/index';
import type { RequestContext } from '../gateway/context';
import { READ_TOOLS, type ToolName } from '../policy/tool-names';
import { redactForAudit } from './redact';

/**
 * Writes one row per tool call to platform.audit_log: who (user, roles, how they
 * authenticated), what (tool, redacted arguments), and the outcome.
 *
 * Never throws: an audit failure must not break the user's request. But it is never
 * silent either: if the database write fails, the full entry is logged at error
 * level, so the record still exists in the logs.
 */

export type AuditOutcome =
  | 'success'
  | 'denied'
  | 'error'
  | 'rate_limited'
  | 'pending_approval'
  | 'cancelled';

export interface AuditEntry {
  ctx: RequestContext;
  toolName: ToolName;
  arguments: unknown;
  outcome: AuditOutcome;
  /** Small, safe summary of the result, e.g. { matches: 2 } or { refund_ref: "RFD-0003" }. */
  resultSummary?: Record<string, unknown>;
  errorCode?: string;
  durationMs: number;
}

export const actionTypeFor = (tool: ToolName): 'read' | 'write' =>
  READ_TOOLS.includes(tool) ? 'read' : 'write';

export async function recordToolCall(entry: AuditEntry): Promise<void> {
  const { ctx } = entry;
  const row = {
    correlationId: ctx.correlationId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roles: ctx.roles,
    authMethod: ctx.auth.method,
    tokenId: ctx.auth.tokenId,
    tokenName: ctx.auth.tokenName,
    toolName: entry.toolName,
    actionType: actionTypeFor(entry.toolName),
    arguments: redactForAudit(entry.arguments),
    outcome: entry.outcome,
    resultSummary: entry.resultSummary
      ? redactForAudit(entry.resultSummary)
      : null,
    errorCode: entry.errorCode ?? null,
    durationMs: Math.max(0, Math.round(entry.durationMs)),
  };

  try {
    await db.insert(auditLog).values(row);
  } catch (error) {
    // Keep the record: the log line carries everything the row would have.
    ctx.log.error(
      { err: error, audit: row },
      'AUDIT WRITE FAILED: entry logged here instead',
    );
  }
}
