import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z, ZodError } from 'zod';
import { env } from '../config/env';
import { AppError, type ErrorCode } from '../errors/index';
import {
  authenticate,
  AuthError,
  wwwAuthenticate,
  type VerifiedIdentity,
} from '../gateway/auth';
import {
  clearLoginFailures,
  loginRetryAfter,
  recordLoginFailure,
} from '../gateway/login-throttle';
import { consume, rateLimitHeaders } from '../gateway/rate-limiter';
import { AUTH_LIMITS } from '../policy/rate-limits';
import type { PatSummary } from '../services/auth-service';
import type { Services } from '../services/index';

/**
 * Auth endpoints for the frontend (and curl):
 *   POST   /auth/login         email + password → access token
 *   POST   /auth/demo          short demo session, no password (web app only)
 *   GET    /auth/me            who am I
 *   POST   /auth/tokens        create a personal access token (for Cursor, Claude...)
 *   GET    /auth/tokens        list my tokens (never the token values)
 *   DELETE /auth/tokens/:id    revoke one of my tokens
 */

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  AMBIGUOUS_MATCH: 409,
  PERMISSION_DENIED: 403,
  POLICY_VIOLATION: 403,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

const LoginBody = z.object({
  email: z.string().max(254),
  password: z.string().max(256),
});

const DemoBody = z.object({
  /** The visitor's real IP, read by the web app (this server only sees the web app's IP). */
  visitor_ip: z.union([z.ipv4(), z.ipv6()]),
});

/** Constant-time compare, so the secret can't be guessed one character at a time. */
function isDemoSecret(given: string | string[] | undefined): boolean {
  if (!env.DEMO_ENABLED || !env.DEMO_SECRET || typeof given !== 'string')
    return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.DEMO_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

const CreatePatBody = z.object({
  name: z.string().max(200),
  expires_in_days: z.number().int().optional(),
});

const toPatJson = (p: PatSummary) => ({
  id: p.id,
  name: p.name,
  token_hint: p.tokenHint,
  status: p.status,
  created_at: p.createdAt.toISOString(),
  expires_at: p.expiresAt.toISOString(),
  last_used_at: p.lastUsedAt?.toISOString() ?? null,
  revoked_at: p.revokedAt?.toISOString() ?? null,
});

declare module 'fastify' {
  interface FastifyRequest {
    identity?: VerifiedIdentity;
  }
}

export async function authRoutes(
  app: FastifyInstance,
  deps: { services: Services },
) {
  const { auth } = deps.services;

  // Tokens must never be cached by browsers or proxies.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('pragma', 'no-cache');
  });

  // One error format for all auth routes: { error: { code, message } }.
  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof AuthError) {
        request.log.warn({ reason: error.reason }, 'Auth refused');
        return reply
          .status(401)
          .header('www-authenticate', wwwAuthenticate(error))
          .send({ error: { code: 'UNAUTHENTICATED', message: error.message } });
      }
      if (error instanceof AppError) {
        if (error.retryAfterSeconds)
          reply.header('retry-after', String(error.retryAfterSeconds));
        return reply.status(HTTP_STATUS[error.code]).send({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }
      if (error instanceof ZodError) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }
      if (error.statusCode && error.statusCode < 500) {
        return reply
          .status(error.statusCode)
          .send({ error: { code: 'BAD_REQUEST', message: error.message } });
      }
      request.log.error({ err: error }, 'Auth route failed');
      return reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong',
          correlation_id: request.id,
        },
      });
    },
  );

  /** Guard for routes that need a logged-in caller. */
  const requireAuth = async (request: FastifyRequest) => {
    request.identity = await authenticate(request.headers.authorization);
  };

  // ─── Login ────────────────────────────────────────────
  app.post(
    '/auth/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = LoginBody.parse(request.body);
      const email = body.email.trim().toLowerCase();

      const wait = await loginRetryAfter(request.ip, email);
      if (wait > 0) {
        request.log.warn({ ip: request.ip }, 'Login throttled');
        throw new AppError(
          'RATE_LIMITED',
          `Too many failed attempts. Try again in ${wait} seconds.`,
          {
            retryAfterSeconds: wait,
          },
        );
      }

      try {
        const result = await auth.login({ email, password: body.password });
        await clearLoginFailures(request.ip, email);
        return reply.send({
          access_token: result.accessToken,
          token_type: 'Bearer',
          expires_at: result.expiresAt.toISOString(),
          user: {
            id: result.user.id,
            email: result.user.email,
            display_name: result.user.displayName,
            roles: result.user.roles,
            tenant_id: result.user.tenantId,
          },
        });
      } catch (error) {
        if (error instanceof AuthError)
          await recordLoginFailure(request.ip, email);
        throw error;
      }
    },
  );

  // ─── Demo login ───────────────────────────────────────
  app.post(
    '/auth/demo',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // No password, so only the web app (which knows DEMO_SECRET) may call this.
      // Demo off (DEMO_ENABLED) or wrong secret looks the same as a missing route.
      if (!isDemoSecret(request.headers['x-demo-secret'])) {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
      }
      const body = DemoBody.parse(request.body);

      const limit = await consume(
        [AUTH_LIMITS.demoPerIp],
        `ip:${body.visitor_ip}`,
      );
      if (!limit.allowed) {
        reply.headers(rateLimitHeaders(limit));
        const minutes = Math.max(1, Math.ceil(limit.retryAfterSec / 60));
        throw new AppError(
          'RATE_LIMITED',
          `Demo available again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
          { retryAfterSeconds: limit.retryAfterSec },
        );
      }

      const result = await auth.demoLogin({
        visitorIp: body.visitor_ip,
        correlationId: request.id,
      });
      return reply.send({
        access_token: result.accessToken,
        token_type: 'Bearer',
        expires_at: result.expiresAt.toISOString(),
        user: {
          id: result.user.id,
          email: result.user.email,
          display_name: result.user.displayName,
          roles: result.user.roles,
          tenant_id: result.user.tenantId,
        },
      });
    },
  );

  // ─── Me ───────────────────────────────────────────────
  app.get(
    '/auth/me',
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const me = await auth.me(request.identity!);
      return {
        id: me.id,
        email: me.email,
        display_name: me.displayName,
        roles: me.roles,
        tenant_id: me.tenantId,
        token_type: me.tokenType,
        token_name: me.tokenName,
      };
    },
  );

  // ─── Personal access tokens ───────────────────────────
  app.post(
    '/auth/tokens',
    { preHandler: requireAuth },
    async (request, reply) => {
      const body = CreatePatBody.parse(request.body);
      const limit = await consume(
        [AUTH_LIMITS.patCreatePerUser],
        `user:${request.identity!.userId}`,
      );
      if (!limit.allowed) {
        reply.headers(rateLimitHeaders(limit));
        throw new AppError(
          'RATE_LIMITED',
          `Too many tokens created. Try again in ${limit.retryAfterSec} seconds.`,
          { retryAfterSeconds: limit.retryAfterSec },
        );
      }
      const pat = await auth.createPat(request.identity!, {
        name: body.name,
        expiresInDays: body.expires_in_days,
      });
      return reply.status(201).send({
        ...toPatJson(pat),
        token: pat.token,
        warning: 'Copy this token now. It will not be shown again.',
      });
    },
  );

  app.get(
    '/auth/tokens',
    { preHandler: requireAuth },
    async (request: FastifyRequest) => ({
      tokens: (await auth.listPats(request.identity!)).map(toPatJson),
    }),
  );

  app.delete<{ Params: { id: string } }>(
    '/auth/tokens/:id',
    { preHandler: requireAuth },
    async (request) =>
      toPatJson(await auth.revokePat(request.identity!, request.params.id)),
  );
}
