import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ShapeOutput,
  ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import { recordToolCall, type AuditOutcome } from '../audit/audit-writer';
import {
  Errors,
  normalizeError,
  toToolError,
  type ErrorCode,
} from '../errors/index';
import { canUseTool } from '../policy/role-policy-store';
import type { ToolName } from '../policy/tool-names';
import { toolSuccess } from './helper';
import type { ToolDeps } from './types';

/**
 * Every tool is built with defineTool(). A tool only describes itself and runs its
 * business logic; the wrapper adds, for every call:
 *   1. permission check (defence in depth, on top of role-filtered registration)
 *   2. timing
 *   3. one audit row: success, denied, error or rate_limited
 *   4. error mapping to the standard tool-error format
 */

/** What a tool handler returns on success. */
export interface ToolResult {
  /** Typed data for structuredContent; must match the tool's outputSchema. */
  structured: Record<string, unknown>;
  /** One-line human-readable summary, shown first in the text content. */
  summary: string;
  /** Small, safe facts for the audit log, e.g. { matches: 2 }. */
  audit?: Record<string, unknown>;
}

export interface ToolDefinition<
  I extends ZodRawShapeCompat,
  O extends ZodRawShapeCompat,
> {
  name: ToolName;
  title: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  annotations: ToolAnnotations;
  handler: (args: ShapeOutput<I>, deps: ToolDeps) => Promise<ToolResult>;
}

/** What the registry stores: a name and a way to register the tool on a server. */
export interface ToolEntry {
  name: ToolName;
  register: (server: McpServer, deps: ToolDeps) => void;
}

/** How an error code is recorded in the audit log. */
function auditOutcomeFor(code: ErrorCode): AuditOutcome {
  if (code === 'RATE_LIMITED') return 'rate_limited';
  if (code === 'PERMISSION_DENIED' || code === 'POLICY_VIOLATION')
    return 'denied';
  return 'error';
}

export function defineTool<
  I extends ZodRawShapeCompat,
  O extends ZodRawShapeCompat,
>(def: ToolDefinition<I, O>): ToolEntry {
  const run = async (
    args: ShapeOutput<I>,
    deps: ToolDeps,
  ): Promise<CallToolResult> => {
    const { ctx, policy } = deps;
    const started = performance.now();
    const elapsed = () => performance.now() - started;

    try {
      // Registration already hides disallowed tools; this makes the rule explicit
      // and gives denials an audit row.
      if (!canUseTool(policy, def.name)) {
        throw Errors.permissionDenied(`Your role does not allow ${def.name}.`);
      }

      const result = await def.handler(args, deps);

      await recordToolCall({
        ctx,
        toolName: def.name,
        arguments: args,
        outcome: 'success',
        resultSummary: result.audit,
        durationMs: elapsed(),
      });
      return toolSuccess(result.structured, result.summary);
    } catch (error) {
      const appError = normalizeError(error);
      await recordToolCall({
        ctx,
        toolName: def.name,
        arguments: args,
        outcome: auditOutcomeFor(appError.code),
        errorCode: appError.code,
        durationMs: elapsed(),
      });
      return toToolError(appError, {
        correlationId: ctx.correlationId,
        log: ctx.log,
        toolName: def.name,
      });
    }
  };

  return {
    name: def.name,
    register: (server, deps) => {
      server.registerTool(
        def.name,
        {
          title: def.title,
          description: def.description,
          inputSchema: def.inputSchema,
          outputSchema: def.outputSchema,
          annotations: def.annotations,
        },
        // The SDK's callback type is conditional on the schema; the shape is the same.
        ((args: ShapeOutput<I>) => run(args, deps)) as never,
      );
    },
  };
}
