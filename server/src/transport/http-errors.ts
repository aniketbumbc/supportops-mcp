import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { ZodError } from 'zod';
import { AppError, type ErrorCode } from '../errors/index';
import { AuthError, wwwAuthenticate } from '../gateway/auth';

/** HTTP status for each error code, for plain HTTP routes (not MCP). */
export const HTTP_STATUS: Record<ErrorCode, number> = {
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

/**
 * One error format for HTTP route plugins: { error: { code, message, details? } }.
 * Register it inside a plugin (app.register) so it applies to that plugin's routes only.
 */
export function registerHttpErrorHandler(app: FastifyInstance): void {
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
        if (HTTP_STATUS[error.code] >= 500)
          request.log.error({ err: error }, error.message);
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
            message: 'Invalid request',
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
      request.log.error({ err: error }, 'Route failed');
      return reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong',
          correlation_id: request.id,
        },
      });
    },
  );
}
