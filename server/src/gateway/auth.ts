import { eq } from 'drizzle-orm';
import { errors as joseErrors, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { personalAccessTokens, users } from '../db/schema/index';
import { ROLES, type Role } from '../policy/roles';
import { getJwtKeys } from './keys';
import { TOKEN_TYPE_CLAIM, TOKEN_TYPES, type TokenType } from './token';

/**
 * Verifies bearer tokens (login tokens and PATs) and returns who is calling.
 *
 * Every token: signature, issuer, audience, expiry (with clock tolerance),
 * allowed algorithm, required claims and token type.
 * PATs additionally: the database row must exist, not be revoked or expired,
 * belong to the token's user, and that user must still be active. Roles for
 * PATs come from the database (current), not from the token.
 */

export interface VerifiedIdentity {
  userId: string;
  tenantId: string;
  roles: Role[];
  tokenType: TokenType;
  /** The token's "jti". For PATs, the personal_access_tokens row id. */
  tokenId: string;
  /** PAT name, e.g. "Cursor on laptop". Null for login tokens. */
  tokenName: string | null;
}

/** Why a token was refused. Logged for operators; callers only see a generic message. */
export type AuthFailureReason =
  | 'missing_token'
  | 'malformed_header'
  | 'token_expired'
  | 'invalid_signature'
  | 'invalid_claims'
  | 'invalid_token'
  | 'wrong_token_type'
  | 'token_revoked'
  | 'token_not_found'
  | 'user_inactive'
  | 'invalid_credentials';

function publicMessage(reason: AuthFailureReason): string {
  if (reason === 'missing_token') return 'Authentication required';
  if (reason === 'invalid_credentials') return 'Invalid email or password';
  return 'Invalid or expired token';
}

export class AuthError extends Error {
  constructor(readonly reason: AuthFailureReason) {
    super(publicMessage(reason));
    this.name = 'AuthError';
  }
}

// ─── Claim helpers ───────────────────────────────────────

/**
 * Value for the WWW-Authenticate header on 401 responses, as the HTTP spec and
 * MCP clients expect. error="invalid_token" only when a token was actually bad.
 */
export function wwwAuthenticate(error?: AuthError): string {
  const realm = `Bearer realm="${env.JWT_AUDIENCE}"`;
  const tokenProblem =
    error &&
    error.reason !== 'missing_token' &&
    error.reason !== 'invalid_credentials';
  return tokenProblem ? `${realm}, error="invalid_token"` : realm;
}

/** Reads a claim by path, so nested claims work: "realm_access.roles". */
function readClaim(payload: JWTPayload, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) => (value as Record<string, unknown> | undefined)?.[key],
      payload,
    );
}

/** Keeps only roles this system knows; anything else is ignored, never trusted. */
function toKnownRoles(value: unknown): Role[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is Role =>
    (ROLES as readonly unknown[]).includes(r),
  );
}

// ─── PAT lookups, cached briefly ─────────────────────────

interface PatRecord {
  userId: string;
  name: string;
  revoked: boolean;
  expiresAt: Date;
  userActive: boolean;
  tenantId: string;
  roles: string[];
}

const PAT_CACHE_TTL_MS = 60_000;
const PAT_CACHE_MAX = 1_000;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60_000;

const patCache = new Map<
  string,
  { record: PatRecord | null; cachedAt: number }
>();
const lastUsedWritten = new Map<string, number>();

/** Called when a PAT is revoked (or its user changes) so the change applies immediately. */
export function forgetPat(tokenId: string): void {
  patCache.delete(tokenId);
}

/** Clears all cached PAT lookups, e.g. after changing a user's roles or disabling them. */
export function forgetAllPats(): void {
  patCache.clear();
}

async function loadPat(tokenId: string): Promise<PatRecord | null> {
  const cached = patCache.get(tokenId);
  if (cached && Date.now() - cached.cachedAt < PAT_CACHE_TTL_MS)
    return cached.record;

  const [row] = await db
    .select({
      userId: personalAccessTokens.userId,
      name: personalAccessTokens.name,
      revokedAt: personalAccessTokens.revokedAt,
      expiresAt: personalAccessTokens.expiresAt,
      userActive: users.isActive,
      tenantId: users.tenantId,
      roles: users.roles,
    })
    .from(personalAccessTokens)
    .innerJoin(users, eq(users.id, personalAccessTokens.userId))
    .where(eq(personalAccessTokens.id, tokenId));

  const record: PatRecord | null = row
    ? {
        userId: row.userId,
        name: row.name,
        revoked: row.revokedAt !== null,
        expiresAt: row.expiresAt,
        userActive: row.userActive,
        tenantId: row.tenantId,
        roles: row.roles,
      }
    : null;

  if (patCache.size >= PAT_CACHE_MAX) patCache.clear();
  patCache.set(tokenId, { record, cachedAt: Date.now() });
  return record;
}

/** Records "last used" at most every few minutes per token, without delaying the request. */
function touchLastUsed(tokenId: string): void {
  const last = lastUsedWritten.get(tokenId) ?? 0;
  if (Date.now() - last < LAST_USED_WRITE_INTERVAL_MS) return;
  lastUsedWritten.set(tokenId, Date.now());
  db.update(personalAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(personalAccessTokens.id, tokenId))
    .catch(() => lastUsedWritten.delete(tokenId)); // best effort; retry on a later call
}

// ─── Verification ────────────────────────────────────────

function mapJoseError(error: unknown): AuthFailureReason {
  if (error instanceof joseErrors.JWTExpired) return 'token_expired';
  if (error instanceof joseErrors.JWTClaimValidationFailed)
    return 'invalid_claims';
  if (
    error instanceof joseErrors.JWSSignatureVerificationFailed ||
    error instanceof joseErrors.JWKSNoMatchingKey
  ) {
    return 'invalid_signature';
  }
  return 'invalid_token';
}

/** Pulls the token out of "Authorization: Bearer <token>". */
export function extractBearerToken(
  header: string | string[] | undefined,
): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new AuthError('missing_token');
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)\s*$/i.exec(value);
  if (!match) throw new AuthError('malformed_header');
  return match[1]!;
}

export async function verifyAccessOrPat(
  token: string,
): Promise<VerifiedIdentity> {
  const keys = await getJwtKeys();

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys.verify, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: keys.algorithms,
      clockTolerance: env.JWT_CLOCK_TOLERANCE_SEC,
      requiredClaims: ['sub', 'exp', 'iat', 'jti'],
    }));
  } catch (error) {
    throw new AuthError(mapJoseError(error));
  }

  const tokenType = payload[TOKEN_TYPE_CLAIM];
  if (!TOKEN_TYPES.includes(tokenType as TokenType))
    throw new AuthError('wrong_token_type');
  const userId = payload.sub!;
  const tokenId = payload.jti!;

  if (tokenType === 'access') {
    const tenant = readClaim(payload, env.JWT_TENANT_CLAIM);
    return {
      userId,
      tenantId: typeof tenant === 'string' && tenant ? tenant : 'default',
      roles: toKnownRoles(readClaim(payload, env.JWT_ROLES_CLAIM)),
      tokenType: 'access',
      tokenId,
      tokenName: null,
    };
  }

  // PAT: the database decides whether it is still valid and what the user may do.
  const pat = await loadPat(tokenId);
  if (!pat || pat.userId !== userId) throw new AuthError('token_not_found');
  if (pat.revoked) throw new AuthError('token_revoked');
  if (pat.expiresAt.getTime() <= Date.now())
    throw new AuthError('token_expired');
  if (!pat.userActive) throw new AuthError('user_inactive');

  touchLastUsed(tokenId);
  return {
    userId,
    tenantId: pat.tenantId,
    roles: toKnownRoles(pat.roles),
    tokenType: 'pat',
    tokenId,
    tokenName: pat.name,
  };
}

/** Convenience: header in, verified identity out. */
export async function authenticate(
  authorization: string | string[] | undefined,
): Promise<VerifiedIdentity> {
  return verifyAccessOrPat(extractBearerToken(authorization));
}
