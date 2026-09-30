import {
  and,
  desc,
  eq,
  gte,
  ilike,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db } from '../db/client';
import { auditLog, users } from '../db/schema/index';
import { Errors } from '../errors/index';
import { hasRole, type RequestContext } from '../gateway/context';

/**
 * Reading the audit trail (admins only). Newest first, paginated by id so pages
 * stay stable while new rows keep arriving.
 */

export const AUDIT_OUTCOMES = [
  'success',
  'denied',
  'error',
  'rate_limited',
  'pending_approval',
  'cancelled',
] as const;
export type AuditOutcomeFilter = (typeof AUDIT_OUTCOMES)[number];

export interface AuditQuery {
  /** Part of the user's email or name. */
  user?: string;
  tool?: string;
  outcome?: AuditOutcomeFilter;
  actionType?: 'read' | 'write';
  /** 'web' = the web app (login token), 'pat' = personal access tokens. */
  source?: 'web' | 'pat';
  correlationId?: string;
  from?: Date;
  to?: Date;
  /** Return rows older than this id (the previous page's nextCursor). */
  before?: number;
  limit?: number;
}

export interface AuditEntry {
  id: number;
  occurredAt: string;
  correlationId: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  roles: string[];
  authMethod: string;
  tokenName: string | null;
  toolName: string;
  actionType: string;
  arguments: Record<string, unknown>;
  outcome: string;
  resultSummary: Record<string, unknown> | null;
  errorCode: string | null;
  durationMs: number;
}

const MAX_LIMIT = 100;

export class AuditService {
  async list(
    ctx: RequestContext,
    q: AuditQuery,
  ): Promise<{ entries: AuditEntry[]; nextCursor: number | null }> {
    if (!hasRole(ctx, 'admin'))
      throw Errors.permissionDenied('Only admins can view the audit log.');
    const limit = Math.min(Math.max(q.limit ?? 50, 1), MAX_LIMIT);

    const where: SQL[] = [eq(auditLog.tenantId, ctx.tenantId)];
    if (q.tool) where.push(eq(auditLog.toolName, q.tool));
    if (q.outcome) where.push(eq(auditLog.outcome, q.outcome));
    if (q.actionType) where.push(eq(auditLog.actionType, q.actionType));
    if (q.source === 'pat') where.push(eq(auditLog.authMethod, 'pat'));
    if (q.source === 'web') where.push(sql`${auditLog.authMethod} <> 'pat'`);
    if (q.correlationId)
      where.push(eq(auditLog.correlationId, q.correlationId.trim()));
    if (q.from) where.push(gte(auditLog.occurredAt, q.from));
    if (q.to) where.push(lte(auditLog.occurredAt, q.to));
    if (q.before) where.push(lt(auditLog.id, q.before));
    if (q.user?.trim()) {
      const like = `%${q.user.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      where.push(or(ilike(users.email, like), ilike(users.displayName, like))!);
    }

    const rows = await db
      .select({
        log: auditLog,
        userName: users.displayName,
        userEmail: users.email,
      })
      .from(auditLog)
      // audit_log.user_id is text (it can hold ids from other auth modes); users.id is a uuid
      .leftJoin(users, sql`${users.id}::text = ${auditLog.userId}`)
      .where(and(...where))
      .orderBy(desc(auditLog.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    return {
      entries: page.map(({ log, userName, userEmail }) => ({
        id: log.id,
        occurredAt: log.occurredAt.toISOString(),
        correlationId: log.correlationId,
        userId: log.userId,
        userName,
        userEmail,
        roles: log.roles,
        authMethod: log.authMethod,
        tokenName: log.tokenName,
        toolName: log.toolName,
        actionType: log.actionType,
        arguments: log.arguments,
        outcome: log.outcome,
        resultSummary: log.resultSummary ?? null,
        errorCode: log.errorCode,
        durationMs: log.durationMs,
      })),
      nextCursor: rows.length > limit ? page.at(-1)!.log.id : null,
    };
  }
}
