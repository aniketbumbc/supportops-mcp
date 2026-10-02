import 'server-only';
import { z } from 'zod';
import { env } from '@/env';
import { ApiError } from './errors';

/**
 * One fetch wrapper for the MCP server's HTTP API (server-side only).
 * - Adds the Bearer token, JSON headers and a timeout.
 * - Never cached: responses are user-specific.
 * - Validates the response with Zod, so the UI only ever sees well-formed data.
 */

const TIMEOUT_MS = 10_000;

const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

interface Options<S extends z.ZodType> {
  method?: 'GET' | 'POST' | 'DELETE';
  /** The logged-in user's access token (from the session cookie). */
  token?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** Extra request headers, e.g. the demo secret. */
  headers?: Record<string, string>;
  schema: S;
}

export async function apiFetch<S extends z.ZodType>(
  path: string,
  { method = 'GET', token, body, query, headers, schema }: Options<S>,
): Promise<z.infer<S>> {
  const url = new URL(path, env.MCP_SERVER_URL);
  for (const [k, v] of Object.entries(query ?? {}))
    if (v !== undefined) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(
      0,
      'UNREACHABLE',
      'The support server is not reachable right now. Try again shortly.',
    );
  }

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = ErrorBody.safeParse(json);
    const retryAfter = Number(response.headers.get('retry-after')) || undefined;
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : `HTTP_${response.status}`,
      parsed.success
        ? parsed.data.error.message
        : `Request failed (${response.status})`,
      parsed.success ? parsed.data.error.details : undefined,
      retryAfter,
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error(
      `Unexpected response shape from ${method} ${path}`,
      parsed.error.issues.slice(0, 5),
    );
    throw new ApiError(
      502,
      'BAD_RESPONSE',
      'The support server sent an unexpected response.',
    );
  }
  return parsed.data;
}
