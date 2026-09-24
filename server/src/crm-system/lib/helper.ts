import { timingSafeEqual } from 'node:crypto';
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { z, ZodError } from 'zod';

/** Error shape every mock API returns: { error: { code, message, details? } } */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string, ref: string) =>
  new ApiError(404, 'not_found', `${what} ${ref} not found`);

/** Validates input with Zod; throws a 400 on failure. */
export function parse<T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.infer<T> {
  return schema.parse(data);
}

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Fetches limit+1 rows upstream; this trims and reports whether more exist. */
export function paginate<T>(rows: T[], limit: number, offset: number) {
  const hasMore = rows.length > limit;
  return {
    data: hasMore ? rows.slice(0, limit) : rows,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
  };
}

/** Escapes % and _ so user input is matched literally in ILIKE. */
export const likePattern = (input: string) =>
  `%${input.replace(/[\\%_]/g, '\\$&')}%`;

export const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Postgres error code, whether raw or wrapped by Drizzle. */
export function pgErrorCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

/** Simulates a vendor API key. Health check stays open for uptime monitors. */
export function registerApiKeyAuth(app: FastifyInstance, apiKey: string) {
  const expected = Buffer.from(apiKey);
  app.addHook('onRequest', async (request: FastifyRequest) => {
    if (request.url === '/health') return;
    const provided = Buffer.from(String(request.headers['x-api-key'] ?? ''));
    const valid =
      provided.length === expected.length &&
      timingSafeEqual(provided, expected);
    if (!valid)
      throw new ApiError(
        401,
        'unauthorized',
        'Missing or invalid x-api-key header',
      );
  });
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof ApiError) {
        return reply.status(error.statusCode).send({
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
            code: 'validation_error',
            message: 'Request validation failed',
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
          .send({ error: { code: 'bad_request', message: error.message } });
      }
      request.log.error({ err: error }, 'Unhandled error');
      return reply
        .status(500)
        .send({
          error: { code: 'internal_error', message: 'Internal server error' },
        });
    },
  );

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send({
        error: {
          code: 'route_not_found',
          message: `${request.method} ${request.url}`,
        },
      }),
  );
}
