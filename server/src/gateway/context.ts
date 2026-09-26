import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { Role } from '../policy/roles.js';
import { authenticate } from './auth.js';

/** How the caller proved who they are. Recorded in logs and (Step 13) the audit log. */
export interface AuthInfo {
  /** 'dev' = AUTH_MODE=dev identity from .env; 'access' = login token; 'pat' = personal access token. */
  method: 'dev' | 'access' | 'pat';
  /** The token's jti (for PATs, the personal_access_tokens row id). Null in dev mode. */
  tokenId: string | null;
  /** PAT name, e.g. "Cursor on laptop". */
  tokenName: string | null;
}

/** Who is calling. From .env in dev mode, from a verified token in jwt mode. */
export interface Identity {
  userId: string;
  tenantId: string;
  roles: Role[];
  auth: AuthInfo;
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
 * Works out who is calling.
 * - jwt: verifies "Authorization: Bearer <token>" (login token or PAT). Throws
 *   AuthError on anything wrong; the transport turns that into HTTP 401.
 * - dev: the fixed identity from .env. Refused in production by env validation.
 */
export async function resolveIdentity(
  headers: Record<string, string | string[] | undefined>,
): Promise<Identity> {
  if (env.AUTH_MODE === 'dev') {
    return {
      userId: env.DEV_USER_ID,
      tenantId: env.DEV_TENANT_ID,
      roles: env.DEV_ROLES,
      auth: { method: 'dev', tokenId: null, tokenName: null },
    };
  }
  const verified = await authenticate(headers.authorization);
  return {
    userId: verified.userId,
    tenantId: verified.tenantId,
    roles: verified.roles,
    auth: {
      method: verified.tokenType,
      tokenId: verified.tokenId,
      tokenName: verified.tokenName,
    },
  };
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
      authMethod: identity.auth.method,
      ...(identity.auth.tokenName && { tokenName: identity.auth.tokenName }),
    }),
  };
}

export function hasRole(
  ctx: Pick<RequestContext, 'roles'>,
  ...roles: Role[]
): boolean {
  return roles.some((role) => ctx.roles.includes(role));
}
