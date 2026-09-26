import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Errors } from '../errors/index';

/**
 * Opaque pagination cursors for list tools.
 *
 * The AI gets a short token (next_cursor) and passes it back to fetch the next
 * page. Inside is the offset plus a fingerprint of the query it belongs to, so:
 * - the AI cannot invent page positions,
 * - a cursor cannot be reused with different filters (e.g. another customer),
 * - anything tampered with or malformed is rejected with VALIDATION_ERROR.
 *
 * Not a security boundary (authorization applies to every page anyway); it keeps
 * pagination correct and unambiguous.
 */

type Scope = Record<string, string | number | boolean | undefined>;

const CursorPayload = z.object({
  v: z.literal(1),
  o: z.number().int().min(0).max(100_000),
  s: z.string().length(12),
});

/** Stable fingerprint of the query: same filters → same value, regardless of key order. */
function fingerprint(scope: Scope): string {
  const stable = Object.keys(scope)
    .filter((key) => scope[key] !== undefined)
    .sort()
    .map((key) => [key, scope[key]]);
  return createHash('sha256')
    .update(JSON.stringify(stable))
    .digest('hex')
    .slice(0, 12);
}

export function encodeCursor(offset: number, scope: Scope): string {
  const payload = { v: 1, o: offset, s: fingerprint(scope) };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** Returns the offset to continue from. No cursor means the first page (offset 0). */
export function decodeCursor(cursor: string | undefined, scope: Scope): number {
  if (cursor === undefined || cursor === '') return 0;

  let payload: z.infer<typeof CursorPayload>;
  try {
    payload = CursorPayload.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
  } catch {
    throw Errors.validation(
      'Invalid cursor. Use next_cursor exactly as returned, or omit it to start from the first page.',
      { field: 'cursor' },
    );
  }

  if (payload.s !== fingerprint(scope)) {
    throw Errors.validation(
      'This cursor belongs to a different search. Omit it to start from the first page.',
      { field: 'cursor' },
    );
  }
  return payload.o;
}
