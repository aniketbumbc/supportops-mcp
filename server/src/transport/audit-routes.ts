import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createRequestContext, resolveIdentity } from '../gateway/context';
import { TOOL_NAMES } from '../policy/tool-names';
import { AUDIT_OUTCOMES, type AuditEntry } from '../services/audit-service';
import type { Services } from '../services/index';
import { registerHttpErrorHandler } from './http-errors';

/**
 * GET /audit (admins only)
 *   ?user=&tool=&outcome=&action_type=&source=web|pat&correlation_id=&from=&to=&before=&limit=
 */

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD')
  .transform((s) => new Date(s))
  .refine((d) => !Number.isNaN(d.getTime()), 'Invalid date');

const Query = z.object({
  user: z.string().max(100).optional(),
  tool: z.enum(TOOL_NAMES).optional(),
  outcome: z.enum(AUDIT_OUTCOMES).optional(),
  action_type: z.enum(['read', 'write']).optional(),
  source: z.enum(['web', 'pat']).optional(),
  correlation_id: z.string().max(100).optional(),
  from: date.optional(),
  to: date.optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const toJson = (e: AuditEntry) => ({
  id: e.id,
  occurred_at: e.occurredAt,
  correlation_id: e.correlationId,
  user_id: e.userId,
  user_name: e.userName,
  user_email: e.userEmail,
  roles: e.roles,
  auth_method: e.authMethod,
  token_name: e.tokenName,
  tool_name: e.toolName,
  action_type: e.actionType,
  arguments: e.arguments,
  outcome: e.outcome,
  result_summary: e.resultSummary,
  error_code: e.errorCode,
  duration_ms: e.durationMs,
});

export async function auditRoutes(
  app: FastifyInstance,
  deps: { services: Services },
) {
  registerHttpErrorHandler(app);

  app.get('/audit', async (request) => {
    const ctx = createRequestContext(
      request.id,
      await resolveIdentity(request.headers),
    );
    // Empty form fields are ignored; "to" as a date means "through the end of that day".
    const q = Query.parse(
      Object.fromEntries(
        Object.entries(request.query as Record<string, string>).filter(
          ([, v]) => v !== '',
        ),
      ),
    );
    const to = q.to
      ? new Date(q.to.getTime() + 24 * 60 * 60 * 1000 - 1)
      : undefined;
    const result = await deps.services.audit.list(ctx, {
      user: q.user,
      tool: q.tool,
      outcome: q.outcome,
      actionType: q.action_type,
      source: q.source,
      correlationId: q.correlation_id,
      from: q.from,
      to,
      before: q.before,
      limit: q.limit,
    });
    return {
      entries: result.entries.map(toJson),
      next_cursor: result.nextCursor,
    };
  });
}
