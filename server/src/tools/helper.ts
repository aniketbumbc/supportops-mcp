import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** 1240000 + "INR" → "₹12,400.00". For human-readable summaries only; data stays in minor units. */
export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

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
