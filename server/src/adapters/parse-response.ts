import type { z } from 'zod';
import { AppError } from '../errors/index';
import type { RequestContext } from '../gateway/context';

/**
 * Validates an upstream JSON response against a Zod schema.
 * A mismatch means the vendor changed or has a bug: log exactly where, and give
 * the AI a generic error instead of passing half-broken data along.
 */
export function parseResponse<S extends z.ZodType>(
  schema: S,
  data: unknown,
  ctx: RequestContext,
  where: { system: string; endpoint: string },
): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    ctx.log.error(
      {
        system: where.system,
        endpoint: where.endpoint,
        issues: result.error.issues.slice(0, 5),
      },
      `${where.system} response did not match the expected shape`,
    );
    throw new AppError(
      'INTERNAL_ERROR',
      'Something went wrong while running this tool.',
    );
  }
  return result.data;
}
