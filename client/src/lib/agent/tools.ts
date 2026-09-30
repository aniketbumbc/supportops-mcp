import 'server-only';
import { dynamicTool, jsonSchema, type ToolSet } from 'ai';
import type { McpSession, McpToolInfo, ToolError } from '@/lib/mcp';

/**
 * Turns the user's MCP tools into AI SDK tools for the model.
 *
 * Refund safety: the model may only PREVIEW refunds.
 * - issue_refund is offered WITHOUT its confirmation_token field, and any token the
 *   model sends anyway is removed before the call. Confirming is a human button click
 *   (a server action), never the model.
 * - The model never sees the confirmation token (toModelOutput strips it); the UI
 *   receives the full result because the Confirm button needs it.
 */

/** What every agent tool returns to the UI (and, minus secrets, to the model). */
export type AgentToolOutput =
  | { ok: true; summary: string; data: Record<string, unknown> | null }
  | { ok: false; error: ToolError };

const HUMAN_ONLY_FIELDS: Record<string, string[]> = {
  issue_refund: ['confirmation_token'],
};

/** Removes fields the model must not set (and must not see in the schema). */
function modelInputSchema(tool: McpToolInfo): Record<string, unknown> {
  const hidden = HUMAN_ONLY_FIELDS[tool.name];
  if (!hidden) return tool.inputSchema;
  const schema = structuredClone(tool.inputSchema) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  for (const field of hidden) delete schema.properties?.[field];
  if (schema.required)
    schema.required = schema.required.filter((f) => !hidden.includes(f));
  return schema;
}

/** In this app the user confirms refunds with a button; the model must not try to. */
const REFUND_PREVIEW_NEXT_STEP =
  'This is only a preview; nothing has happened. The user sees a refund card with a ' +
  '"Confirm refund" button. Tell them to review it and click Confirm if it is right. ' +
  'You cannot confirm it yourself; do not call issue_refund again for this refund.';

/**
 * What the model sees from a result: everything except secrets like the confirmation
 * token. Refund previews also get this app's next step instead of the server's generic
 * "call again with confirmation_token" (meant for clients like Cursor).
 */
function forModel(toolName: string, output: AgentToolOutput): unknown {
  if (!output.ok || !output.data || !HUMAN_ONLY_FIELDS[toolName]) return output;
  const data: Record<string, unknown> = { ...output.data };
  for (const field of HUMAN_ONLY_FIELDS[toolName]!) delete data[field];

  if (toolName === 'issue_refund' && data.status === 'requires_confirmation') {
    delete data.message;
    delete data.confirmation_expires_at;
    data.next_step = REFUND_PREVIEW_NEXT_STEP;
    const firstSentence =
      output.summary.split('. Nothing has happened')[0] ?? output.summary;
    return { ...output, summary: `${firstSentence}.`, data };
  }
  return { ...output, data };
}

export function buildAgentTools(
  mcp: McpSession,
  tools: McpToolInfo[],
): ToolSet {
  const set: ToolSet = {};
  for (const t of tools) {
    set[t.name] = dynamicTool({
      description: t.description ?? t.title ?? t.name,
      inputSchema: jsonSchema(modelInputSchema(t)),
      execute: async (input): Promise<AgentToolOutput> => {
        const args = { ...(input as Record<string, unknown>) };
        for (const field of HUMAN_ONLY_FIELDS[t.name] ?? []) delete args[field];

        const result = await mcp.callTool(t.name, args);
        return result.ok
          ? {
              ok: true,
              summary: result.text.split('\n')[0] ?? '',
              data: result.structured,
            }
          : { ok: false, error: result.error };
      },
      toModelOutput: ({ output }) => ({
        type: 'json',
        value: forModel(t.name, output as AgentToolOutput) as never,
      }),
    });
  }
  return set;
}
