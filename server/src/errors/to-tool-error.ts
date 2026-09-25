import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { AppError } from './app-error.js';

/** The JSON the AI receives when a tool fails. */
export interface ToolErrorPayload {
  error: {
    code: AppError['code'];
    message: string;
    retryable: boolean;
    retry_after_seconds?: number;
    details?: Record<string, unknown>;
    correlation_id: string;
  };
}

/** Anything thrown becomes an AppError. Unknown errors become a generic INTERNAL_ERROR. */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new AppError('VALIDATION_ERROR', 'Invalid input', {
      details: {
        issues: error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      cause: error,
    });
  }
  return new AppError(
    'INTERNAL_ERROR',
    'Something went wrong while running this tool.',
    {
      cause: error,
    },
  );
}

/**
 * Turns any error into an MCP tool error result the AI can read and act on.
 * - Expected errors (validation, not found, ...) are passed through with their message.
 * - Unexpected errors are logged in full here, but the AI only sees a generic
 *   message plus the correlation ID, never a stack trace or internal detail.
 */
export function toToolError(
  error: unknown,
  ctx: { correlationId: string; log: Logger; toolName: string },
): CallToolResult {
  const appError = normalizeError(error);

  const logFields = {
    tool: ctx.toolName,
    correlationId: ctx.correlationId,
    code: appError.code,
  };
  if (appError.code === 'INTERNAL_ERROR') {
    ctx.log.error(
      { ...logFields, err: appError.cause ?? appError },
      'Tool failed unexpectedly',
    );
  } else if (appError.retryable) {
    ctx.log.warn({ ...logFields, err: appError.cause }, appError.message);
  } else {
    ctx.log.info(logFields, appError.message);
  }

  const payload: ToolErrorPayload = {
    error: {
      code: appError.code,
      message: appError.message,
      retryable: appError.retryable,
      ...(appError.retryAfterSeconds !== undefined && {
        retry_after_seconds: appError.retryAfterSeconds,
      }),
      ...(appError.details && { details: appError.details }),
      correlation_id: ctx.correlationId,
    },
  };

  // isError: true tells the client this call failed. Output-schema validation
  // is skipped for errors, so the JSON goes in the text content.
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}
