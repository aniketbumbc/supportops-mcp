import { createHash, randomUUID } from 'node:crypto';
import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env';
import { AppError, Errors } from '../errors/index';
import { getRedis, redisKey } from '../infra/redis';
import type { RequestContext } from './context';
import { stableJson } from './idempotency';
import { getJwtKeys } from './keys';

/**
 * Confirmation tokens for two-step actions (issue_refund).
 *
 * The preview returns a token; only a confirm call carrying it can execute. The token:
 * - is signed with the server's key (can't be forged or edited),
 * - expires after 5 minutes,
 * - is bound to the user, the operation and a fingerprint of the exact request,
 * - can be used once (recorded in Redis),
 * - can never be used as a login token (own type and audience).
 *
 * verify and consume are separate on purpose: the caller consumes the token inside
 * its idempotent block, so a retried confirm returns the stored result instead of
 * failing with "already used".
 */

export const CONFIRMATION_TTL_SEC = 5 * 60;
const TOKEN_TYPE = 'confirmation';
const audience = () => `${env.JWT_AUDIENCE}#confirm`;

/** Fingerprint of what the user is confirming. Any change → a different value. */
const fingerprint = (request: unknown) =>
  createHash('sha256').update(stableJson(request)).digest('base64url');

export interface IssuedConfirmation {
  token: string;
  expiresAt: Date;
}

export interface VerifiedConfirmation<D> {
  /** The decision captured at preview time (e.g. payment chosen, action). */
  decision: D;
  tokenId: string;
  expiresAt: Date;
}

/** Issues a token for `operation` on `request`, carrying the preview's `decision`. */
export async function createConfirmation(
  ctx: RequestContext,
  operation: string,
  request: unknown,
  decision: Record<string, unknown>,
): Promise<IssuedConfirmation> {
  const { signing } = await getJwtKeys();
  if (!signing)
    throw new AppError(
      'INTERNAL_ERROR',
      'This server cannot issue confirmations.',
    );

  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_SEC * 1000);
  const token = await new SignJWT({
    token_type: TOKEN_TYPE,
    op: operation,
    tenant: ctx.tenantId,
    req: fingerprint(request),
    decision,
  })
    .setProtectedHeader({ alg: signing.alg, kid: signing.kid, typ: 'JWT' })
    .setIssuer(env.JWT_ISSUER!)
    .setAudience(audience())
    .setSubject(ctx.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(signing.key);

  return { token, expiresAt };
}

const invalid = (why: string) =>
  Errors.validation(
    `confirmation_token ${why}. Call again WITHOUT confirmation_token to get a fresh preview, ` +
      'show it to the user, and confirm only after they agree.',
    { field: 'confirmation_token' },
  );

/**
 * Checks a token without using it up: signature, expiry, type, audience, same user
 * and tenant, same operation, and the exact same request.
 */
export async function verifyConfirmation<D>(
  ctx: RequestContext,
  token: string,
  operation: string,
  request: unknown,
): Promise<VerifiedConfirmation<D>> {
  const keys = await getJwtKeys();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys.verify, {
      issuer: env.JWT_ISSUER,
      audience: audience(),
      algorithms: keys.algorithms,
      requiredClaims: ['sub', 'jti', 'exp'],
    }));
  } catch (error) {
    throw invalid(
      error instanceof joseErrors.JWTExpired
        ? 'has expired (they last 5 minutes)'
        : 'is not valid',
    );
  }

  if (payload.token_type !== TOKEN_TYPE || payload.op !== operation) {
    throw invalid('is not for this action');
  }
  if (payload.sub !== ctx.userId || payload.tenant !== ctx.tenantId) {
    throw Errors.permissionDenied(
      'This confirmation belongs to a different user.',
    );
  }
  if (payload.req !== fingerprint(request)) {
    throw invalid(
      'was issued for different details (amount, invoice, reason or note changed)',
    );
  }

  return {
    decision: payload.decision as D,
    tokenId: payload.jti!,
    expiresAt: new Date(payload.exp! * 1000),
  };
}

/**
 * Marks a verified token as used. Throws CONFLICT if it was already used.
 * Call this inside the idempotent block that performs the action.
 */
export async function consumeConfirmation(
  confirmation: VerifiedConfirmation<unknown>,
): Promise<void> {
  const ttlSec = Math.max(
    1,
    Math.ceil((confirmation.expiresAt.getTime() - Date.now()) / 1000),
  );
  const first = await getRedis().set(
    redisKey('confirm', 'used', confirmation.tokenId),
    '1',
    'EX',
    ttlSec,
    'NX',
  );
  if (first !== 'OK') {
    throw Errors.conflict(
      'This confirmation_token was already used. Get a new preview if another action is intended.',
    );
  }
}
