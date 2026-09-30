import 'server-only';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { env } from '@/env';

/**
 * Talks to the MCP server AS THE LOGGED-IN USER: every connection carries that user's
 * token, so the server applies their roles, limits and audit trail. Server-side only;
 * the browser never sees the token or talks to the MCP server directly.
 *
 * The MCP server is stateless, so a connection is cheap: open, use, close.
 */

/** Why an MCP call could not be made at all (as opposed to a tool returning an error). */
export class McpConnectionError extends Error {
  constructor(
    readonly kind:
      | 'unauthenticated'
      | 'rate_limited'
      | 'unreachable'
      | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'McpConnectionError';
  }
}

export interface McpToolInfo {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}

/** The standard error a tool returns (see server: errors/to-tool-error.ts). */
export interface ToolError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
  correlationId?: string;
}

export type ToolCallResult =
  | { ok: true; structured: Record<string, unknown> | null; text: string }
  | { ok: false; error: ToolError };

function toConnectionError(error: unknown): McpConnectionError {
  if (error instanceof StreamableHTTPError) {
    if (error.code === 401)
      return new McpConnectionError(
        'unauthenticated',
        'Your session has ended. Sign in again.',
      );
    if (error.code === 429)
      return new McpConnectionError(
        'rate_limited',
        'Too many requests. Wait a minute and try again.',
      );
    return new McpConnectionError(
      'failed',
      `The support server returned an error (${error.code ?? 'unknown'}).`,
    );
  }
  const code = (error as { cause?: { code?: string } })?.cause?.code;
  if (error instanceof TypeError || code === 'ECONNREFUSED') {
    return new McpConnectionError(
      'unreachable',
      'The support server is not reachable right now.',
    );
  }
  return new McpConnectionError('failed', 'Could not reach the support tools.');
}

/** Tool errors arrive as JSON text: {"error": {code, message, retryable, ...}}. */
function parseToolError(text: string): ToolError {
  try {
    const e = (JSON.parse(text) as { error?: Record<string, unknown> }).error;
    if (e && typeof e.code === 'string') {
      return {
        code: e.code,
        message: String(e.message ?? 'The tool failed.'),
        retryable: Boolean(e.retryable),
        retryAfterSeconds:
          typeof e.retry_after_seconds === 'number'
            ? e.retry_after_seconds
            : undefined,
        details: (e.details as Record<string, unknown>) ?? undefined,
        correlationId:
          typeof e.correlation_id === 'string' ? e.correlation_id : undefined,
      };
    }
  } catch {
    /* not our JSON format: e.g. the SDK's own "Tool not found" message */
  }
  return {
    code: 'TOOL_ERROR',
    message: text || 'The tool failed.',
    retryable: false,
  };
}

/** One open connection to the MCP server for one user. Always close() it (or use withMcp). */
export class McpSession {
  private constructor(private readonly client: Client) {}

  static async open(token: string): Promise<McpSession> {
    const client = new Client({ name: 'supportops-web', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(
      new URL('/mcp', env.MCP_SERVER_URL),
      {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      },
    );
    try {
      await client.connect(transport);
    } catch (error) {
      await client.close().catch(() => undefined);
      throw toConnectionError(error);
    }
    return new McpSession(client);
  }

  /** The tools THIS user may use (the server filters by role). */
  async listTools(): Promise<McpToolInfo[]> {
    try {
      const { tools } = await this.client.listTools();
      return tools.map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
        annotations: t.annotations,
      }));
    } catch (error) {
      throw toConnectionError(error);
    }
  }

  /**
   * Calls a tool. A tool that runs but refuses (validation, permission, policy, rate
   * limit...) returns { ok: false, error } rather than throwing, so the agent and UI
   * can show the reason. Only connection problems throw McpConnectionError.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    let result;
    try {
      result = await this.client.callTool({ name, arguments: args });
    } catch (error) {
      throw toConnectionError(error);
    }
    const text = (result.content as { type: string; text?: string }[])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
    if (result.isError) return { ok: false, error: parseToolError(text) };
    return {
      ok: true,
      structured:
        (result.structuredContent as Record<string, unknown> | undefined) ??
        null,
      text,
    };
  }

  async close(): Promise<void> {
    await this.client.close().catch(() => undefined);
  }
}

/** Opens a session for `token`, runs `fn`, and always closes it. */
export async function withMcp<T>(
  token: string,
  fn: (mcp: McpSession) => Promise<T>,
): Promise<T> {
  const mcp = await McpSession.open(token);
  try {
    return await fn(mcp);
  } finally {
    await mcp.close();
  }
}
