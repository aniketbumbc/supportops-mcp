import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
export { formatMoney } from '../domain/helper';
/**
 * Standard success result: typed data in structuredContent, plus a text copy
 * (one-line summary + JSON) for clients that only read text.
 */
export function toolSuccess(
  structured: Record<string, unknown>,
  summary: string,
): CallToolResult {
  return {
    structuredContent: structured,
    content: [
      { type: 'text', text: `${summary}\n${JSON.stringify(structured)}` },
    ],
  };
}
