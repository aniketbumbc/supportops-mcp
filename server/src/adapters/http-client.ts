import { AppError, Errors } from '../errors/index';
import type { RequestContext } from '../gateway/context';

/**
 * Small HTTP client shared by all adapters (CRM, billing, ticketing).
 * - Adds base URL, API key, JSON headers and the correlation ID.
 * - Times out slow calls.
 * - Retries once on network errors / 5xx, for GET only (safe to repeat).
 * - Turns every upstream failure into an AppError the rest of the code understands.
 */

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** For write calls to endpoints that support it (refunds, subscriptions). */
  idempotencyKey?: string;
}

export interface HttpClientConfig {
  /** Human name used in errors and logs, e.g. "CRM". */
  system: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

/** Error body shape returned by the mock systems (and most vendor APIs). */
interface UpstreamErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

const RETRY_DELAY_MS = 200;

export function createHttpClient(config: HttpClientConfig) {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  function buildUrl(path: string, query?: Query): string {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /** Maps an HTTP error response to an AppError. */
  async function toAppError(
    response: Response,
    ctx: RequestContext,
  ): Promise<AppError> {
    const body = (await response.json().catch(() => ({}))) as UpstreamErrorBody;
    const message =
      body.error?.message ??
      `${config.system} returned HTTP ${response.status}`;
    const details = { system: config.system, upstream_code: body.error?.code };

    switch (response.status) {
      case 400:
        return new AppError('VALIDATION_ERROR', message, { details });
      case 404:
        return new AppError('NOT_FOUND', message, { details });
      case 409:
      case 422:
        // The upstream system refused because of the current state of the data.
        return new AppError('CONFLICT', message, {
          details: { ...details, upstream_details: body.error?.details },
        });
      case 429: {
        const retryAfter = Number(response.headers.get('retry-after')) || 30;
        return Errors.rateLimited(retryAfter);
      }
      case 401:
      case 403:
        // Our own credentials are wrong: a configuration bug, not the user's problem.
        ctx.log.error(
          { system: config.system, status: response.status },
          'Upstream rejected our credentials; check the API key',
        );
        return new AppError(
          'INTERNAL_ERROR',
          'Something went wrong while running this tool.',
        );
      default:
        return Errors.upstream(
          config.system,
          new Error(`HTTP ${response.status}: ${message}`),
        );
    }
  }

  async function request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    ctx: RequestContext,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = buildUrl(path, options.query);
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-api-key': config.apiKey,
      'x-request-id': ctx.correlationId,
    };
    if (options.body !== undefined)
      headers['content-type'] = 'application/json';
    if (options.idempotencyKey)
      headers['idempotency-key'] = options.idempotencyKey;

    const maxAttempts = method === 'GET' ? 2 : 1;

    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      try {
        const response = await fetch(url, {
          method,
          headers,
          body:
            options.body !== undefined
              ? JSON.stringify(options.body)
              : undefined,
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        const durationMs = Date.now() - started;

        if (response.status >= 500 && attempt < maxAttempts) {
          ctx.log.warn(
            {
              system: config.system,
              method,
              path,
              status: response.status,
              attempt,
            },
            'Upstream 5xx, retrying',
          );
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        if (!response.ok) {
          ctx.log.debug(
            {
              system: config.system,
              method,
              path,
              status: response.status,
              durationMs,
            },
            'Upstream error response',
          );
          throw await toAppError(response, ctx);
        }

        ctx.log.debug(
          {
            system: config.system,
            method,
            path,
            status: response.status,
            durationMs,
          },
          'Upstream call',
        );
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof AppError) throw error;
        // Network failure or timeout: retry GETs once, otherwise report upstream unavailable.
        if (attempt < maxAttempts) {
          ctx.log.warn(
            { system: config.system, method, path, attempt, err: error },
            'Upstream call failed, retrying',
          );
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw Errors.upstream(config.system, error);
      }
    }
  }

  return {
    get: <T>(path: string, ctx: RequestContext, query?: Query) =>
      request<T>('GET', path, ctx, { query }),
    post: <T>(
      path: string,
      ctx: RequestContext,
      body: unknown,
      idempotencyKey?: string,
    ) => request<T>('POST', path, ctx, { body, idempotencyKey }),
    patch: <T>(path: string, ctx: RequestContext, body: unknown) =>
      request<T>('PATCH', path, ctx, { body }),
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
