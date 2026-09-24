/** Every MCP tool the server exposes. Must match docs/tool-contract.md. */
export const TOOL_NAMES = [
  'find_customer',
  'get_customer_account',
  'get_customer_invoices',
  'search_customer_tickets',
  'create_support_ticket',
  'update_ticket',
  'issue_refund',
  'create_customer',
  'update_customer',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const READ_TOOLS: ToolName[] = [
  'find_customer',
  'get_customer_account',
  'get_customer_invoices',
  'search_customer_tickets',
];
