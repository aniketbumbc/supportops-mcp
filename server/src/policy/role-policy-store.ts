import { logger } from '../config/logger';
import { db } from '../db/client';
import { rolePolicies } from '../db/schema/index';
import { AppError } from '../errors/index';
import type { Role } from './roles';
import { TOOL_NAMES, type ToolName } from './tool-names';

/**
 * What each role may do, loaded from platform.role_policies.
 *
 * - Cached for 60s: no database query per MCP call; edits in the DB apply within a minute.
 * - Single-flight: when the cache expires, concurrent requests share one query.
 * - Fails closed: if the DB is unreachable, the last good policies are used for up to
 *   10 minutes; with nothing loaded yet, access is refused. Never "allow everything".
 */

export interface RolePolicy {
  role: string;
  allowedTools: ToolName[];
  directRefundLimitMinor: number;
  approvalRefundLimitMinor: number;
  canApproveRefunds: boolean;
}

/** The combined permissions of everything a user's roles allow. */
export interface EffectivePolicy {
  roles: Role[];
  allowedTools: ReadonlySet<ToolName>;
  /** Largest refund the user may execute without approval (minor units). 0 = none. */
  directRefundLimitMinor: number;
  /** Largest refund the user may request via approval. 0 = none. */
  approvalRefundLimitMinor: number;
  canApproveRefunds: boolean;
}

const CACHE_TTL_MS = 60_000;
const MAX_STALE_MS = 10 * 60_000;

const log = logger.child({ component: 'role-policies' });

let cache: { byRole: Map<string, RolePolicy>; loadedAt: number } | null = null;
let inFlight: Promise<Map<string, RolePolicy>> | null = null;

const isToolName = (name: string): name is ToolName =>
  (TOOL_NAMES as readonly string[]).includes(name);

async function loadFromDb(): Promise<Map<string, RolePolicy>> {
  const rows = await db.select().from(rolePolicies);
  const byRole = new Map<string, RolePolicy>();
  for (const row of rows) {
    const unknownTools = row.allowedTools.filter((t) => !isToolName(t));
    if (unknownTools.length > 0) {
      log.warn(
        { role: row.role, unknownTools },
        'Role policy lists unknown tools; ignoring them',
      );
    }
    byRole.set(row.role, {
      role: row.role,
      allowedTools: row.allowedTools.filter(isToolName),
      directRefundLimitMinor: row.directRefundLimitMinor,
      approvalRefundLimitMinor: row.approvalRefundLimitMinor,
      canApproveRefunds: row.canApproveRefunds,
    });
  }
  return byRole;
}

async function policiesByRole(): Promise<Map<string, RolePolicy>> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) return cache.byRole;

  inFlight ??= loadFromDb()
    .then((byRole) => {
      cache = { byRole, loadedAt: Date.now() };
      return byRole;
    })
    .finally(() => {
      inFlight = null;
    });

  try {
    return await inFlight;
  } catch (error) {
    if (cache && now - cache.loadedAt < MAX_STALE_MS) {
      log.warn(
        { err: error, ageMs: now - cache.loadedAt },
        'Using cached role policies: DB unavailable',
      );
      return cache.byRole;
    }
    log.error(
      { err: error },
      'Role policies unavailable and no usable cache: refusing access',
    );
    throw new AppError(
      'UPSTREAM_UNAVAILABLE',
      'Permissions are temporarily unavailable. Try again shortly.',
      { cause: error },
    );
  }
}

/**
 * Combines the policies of all the user's roles: a tool is allowed if any role
 * allows it; limits are the highest any role grants. Roles with no policy row
 * grant nothing.
 */
export async function getEffectivePolicy(
  roles: Role[],
): Promise<EffectivePolicy> {
  const byRole = await policiesByRole();
  const policies = roles
    .map((r) => byRole.get(r))
    .filter((p): p is RolePolicy => Boolean(p));

  return {
    roles,
    allowedTools: new Set(policies.flatMap((p) => p.allowedTools)),
    directRefundLimitMinor: Math.max(
      0,
      ...policies.map((p) => p.directRefundLimitMinor),
    ),
    approvalRefundLimitMinor: Math.max(
      0,
      ...policies.map((p) => p.approvalRefundLimitMinor),
    ),
    canApproveRefunds: policies.some((p) => p.canApproveRefunds),
  };
}

export const canUseTool = (policy: EffectivePolicy, tool: ToolName): boolean =>
  policy.allowedTools.has(tool);

/** Drops the cache so the next call reloads from the DB (e.g. after an admin edits policies). */
export function invalidateRolePolicies(): void {
  cache = null;
}
