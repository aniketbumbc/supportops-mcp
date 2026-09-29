/**
 * Every failed call to the MCP server's HTTP API becomes an ApiError.
 * Pages and actions branch on `status` / `code` to show the right message.
 */
export class ApiError extends Error {
  constructor(
    /** HTTP status; 0 when the server could not be reached. */
    readonly status: number,
    /** Server error code, e.g. UNAUTHENTICATED, RATE_LIMITED, VALIDATION_ERROR. */
    readonly code: string,
    message: string,
    readonly details?: unknown,
    /** Seconds to wait, when the server sent Retry-After. */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The login token is missing, invalid or expired: the user must log in again. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}
