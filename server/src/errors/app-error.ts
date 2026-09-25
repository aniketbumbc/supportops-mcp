/**
 * The error codes every tool can return. Must match docs/tool-contract.md §4.
 * Services and adapters throw AppError; tools turn it into an MCP tool error.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'AMBIGUOUS_MATCH',
  'PERMISSION_DENIED',
  'POLICY_VIOLATION',
  'CONFLICT',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Codes where retrying later can succeed. The AI is told this explicitly. */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
]);

interface AppErrorOptions {
  /** Safe, structured extra info for the AI (never secrets or stack traces). */
  details?: Record<string, unknown>;
  /** For RATE_LIMITED: how long to wait before retrying. */
  retryAfterSeconds?: number;
  /** The original error, kept for logs only. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

/** Shortcuts for the errors services throw most often. */
export const Errors = {
  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError('VALIDATION_ERROR', message, { details }),

  notFound: (what: string, ref: string) =>
    new AppError('NOT_FOUND', `${what} ${ref} not found`, { details: { ref } }),

  ambiguous: (message: string, details?: Record<string, unknown>) =>
    new AppError('AMBIGUOUS_MATCH', message, { details }),

  permissionDenied: (message: string) =>
    new AppError('PERMISSION_DENIED', message),

  policyViolation: (message: string, details?: Record<string, unknown>) =>
    new AppError('POLICY_VIOLATION', message, { details }),

  conflict: (message: string, details?: Record<string, unknown>) =>
    new AppError('CONFLICT', message, { details }),

  rateLimited: (retryAfterSeconds: number) =>
    new AppError(
      'RATE_LIMITED',
      `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
      {
        retryAfterSeconds,
      },
    ),

  upstream: (system: string, cause?: unknown) =>
    new AppError(
      'UPSTREAM_UNAVAILABLE',
      `The ${system} system is not responding right now. Try again shortly.`,
      { details: { system }, cause },
    ),
};
