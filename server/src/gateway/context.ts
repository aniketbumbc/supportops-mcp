import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../errors/index';
import type { Role } from '../policy/roles';

/** Who is calling. Comes from env in dev mode. */
export interface Identity {
  userId: string;
  tenantId: string;
  roles: Role[];
}

/** Everything a tool, service or adapter needs to know about the current call. */
export interface RequestContext extends Identity {
  /** Ties together logs, audit rows and error messages for one request. */
  correlationId: string;
  /** Logger that stamps every line with correlationId and userId. */
  log: Logger;
}

const SAFE_ID = /^[A-Za-z0-9._-]{8,100}$/;

/**
 * Reuses an incoming x-request-id (e.g. from Caddy or the Next.js client) so one ID
 * follows the request across services. Anything malformed is replaced, since the
 * value ends up in logs and responses.
 */
export function resolveCorrelationId(
  incoming: string | string[] | undefined,
): string {
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && SAFE_ID.test(value) ? value : `req_${randomUUID()}`;
}

/**
 * Works out who is calling. Phase 2: the dev user from env.
 */
export function resolveIdentity(
  _headers: Record<string, string | string[] | undefined>,
): Identity {
  if (env.AUTH_MODE === 'dev') {
    return {
      userId: env.DEV_USER_ID,
      tenantId: env.DEV_TENANT_ID,
      roles: env.DEV_ROLES,
    };
  }
  throw new AppError(
    'PERMISSION_DENIED',
    'JWT authentication is not implemented yet',
  );
}

export function createRequestContext(
  correlationId: string,
  identity: Identity,
): RequestContext {
  return {
    ...identity,
    correlationId,
    log: logger.child({
      correlationId,
      userId: identity.userId,
      tenantId: identity.tenantId,
    }),
  };
}

export function hasRole(
  ctx: Pick<RequestContext, 'roles'>,
  ...roles: Role[]
): boolean {
  return roles.some((role) => ctx.roles.includes(role));
}
