import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { env } from '../config/env';
import { AppError } from '../errors/index';
import type { Role } from '../policy/roles';
import { getJwtKeys, type SigningKey } from './keys';

/**
 * Signs the two kinds of token this server issues. Both use the same key and are
 * verified the same way; the "token_type" claim tells them apart.
 *
 * - access: from login, for the frontend. Short-lived. Carries roles and tenant.
 * - pat:    personal access token for MCP clients (Cursor, Claude). Long-lived.
 *           Carries NO roles: the verifier loads the user's current roles and active
 *           status from the database, so demoting or disabling someone takes effect
 *           within a minute instead of when the token expires.
 */

export const TOKEN_TYPE_CLAIM = 'token_type';
export const TOKEN_TYPES = ['access', 'pat'] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

export interface TokenUser {
  id: string;
  tenantId: string;
  roles: Role[];
  email: string;
  displayName: string;
}

export interface IssuedToken {
  token: string;
  tokenId: string;
  expiresAt: Date;
}

async function signingKey(): Promise<SigningKey> {
  const { signing } = await getJwtKeys();
  if (!signing) {
    // Only possible when an external identity provider issues tokens (JWKS_URL, no private key).
    throw new AppError(
      'INTERNAL_ERROR',
      'This server is not configured to issue tokens.',
    );
  }
  return signing;
}

function baseJwt(
  claims: Record<string, unknown>,
  key: SigningKey,
  sub: string,
  jti: string,
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: key.alg, kid: key.kid, typ: 'JWT' })
    .setIssuer(env.JWT_ISSUER!)
    .setAudience(env.JWT_AUDIENCE)
    .setSubject(sub)
    .setJti(jti)
    .setIssuedAt();
}

/** Login token for the frontend. */
export async function issueAccessToken(user: TokenUser): Promise<IssuedToken> {
  const key = await signingKey();
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + env.JWT_ACCESS_TTL_MINUTES * 60_000);

  const token = await baseJwt(
    {
      [TOKEN_TYPE_CLAIM]: 'access' satisfies TokenType,
      [env.JWT_ROLES_CLAIM]: user.roles,
      [env.JWT_TENANT_CLAIM]: user.tenantId,
      email: user.email,
      name: user.displayName,
    },
    key,
    user.id,
    tokenId,
  )
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key.key);

  return { token, tokenId, expiresAt };
}

/**
 * Personal access token. The caller creates the database row first (its id becomes
 * the token's "jti") so the token can be listed and revoked.
 */
export async function issuePersonalAccessToken(input: {
  userId: string;
  tokenId: string;
  expiresAt: Date;
}): Promise<IssuedToken> {
  const key = await signingKey();

  const token = await baseJwt(
    { [TOKEN_TYPE_CLAIM]: 'pat' satisfies TokenType },
    key,
    input.userId,
    input.tokenId,
  )
    .setExpirationTime(Math.floor(input.expiresAt.getTime() / 1000))
    .sign(key.key);

  return { token, tokenId: input.tokenId, expiresAt: input.expiresAt };
}

/** Last characters of a token, stored so users can tell their tokens apart. */
export const tokenHint = (token: string) => `…${token.slice(-6)}`;
