import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { z, ZodError } from 'zod';
import { AppError, type ErrorCode } from '../errors/index';
import {
  authenticate,
  AuthError,
  type VerifiedIdentity,
  wwwAuthenticate,
} from '../gateway/auth';
import {
  clearFailures,
  LOGIN_RULES,
  recordFailure,
  retryAfterSeconds,
} from '../services/login-throttle';
import type { PatSummary } from '../services/auth-service';
import type { Services } from '../services/index';

/**
 * Auth endpoints for the frontend (and curl):
 *   POST   /auth/login         email + password → access token
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
  app.addHook(
    'onSend',
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('cache-control', 'no-store');
      reply.header('pragma', 'no-cache');
    },
  );

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
      const emailKey = `login:${request.ip}:${email}`;
      const ipKey = `login-ip:${request.ip}`;

      const wait = Math.max(
        retryAfterSeconds(emailKey, LOGIN_RULES.perEmailAndIp),
        retryAfterSeconds(ipKey, LOGIN_RULES.perIp),
      );
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
        clearFailures(emailKey);
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
        if (error instanceof AuthError) {
          recordFailure(emailKey, LOGIN_RULES.perEmailAndIp);
          recordFailure(ipKey, LOGIN_RULES.perIp);
        }
        throw error;
      }
    },
  );

  // ─── Me ───────────────────────────────────────────────
  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
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
  });

  // ─── Personal access tokens ───────────────────────────
  app.post(
    '/auth/tokens',
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = CreatePatBody.parse(request.body);
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
    async (request: FastifyRequest) =>
      toPatJson(await auth.revokePat(request.identity!, request.params.id)),
  );
}
