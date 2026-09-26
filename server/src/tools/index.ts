import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolName } from '../policy/tool-names';
import { FIND_CUSTOMER, registerFindCustomer } from './find-customer';
import {
  GET_CUSTOMER_ACCOUNT,
  registerGetCustomerAccount,
} from './get-customer-account';
import {
  GET_CUSTOMER_INVOICES,
  registerGetCustomerInvoices,
} from './get-customer-invoices';
import {
  SEARCH_CUSTOMER_TICKETS,
  registerSearchCustomerTickets,
} from './search-customer-tickets';
import type { ToolDeps } from './types';

interface ToolEntry {
  name: ToolName;
  register: (server: McpServer, deps: ToolDeps) => void;
}

/**
 * Every tool the server can expose. Add one line per new tool.
 * Names are typed as ToolName, so a tool missing from policy/tool-names.ts
 * (and therefore from role policies) fails the typecheck.
 */
export const TOOL_REGISTRY: ToolEntry[] = [
  { name: FIND_CUSTOMER, register: registerFindCustomer },
  { name: GET_CUSTOMER_ACCOUNT, register: registerGetCustomerAccount },
  { name: GET_CUSTOMER_INVOICES, register: registerGetCustomerInvoices },
  { name: SEARCH_CUSTOMER_TICKETS, register: registerSearchCustomerTickets },
];

/**
 * Registers tools on a fresh per-request MCP server.
 * Phase 4 adds the role filter here: only tools the caller's role allows get
 * registered, so tools/list shows each user exactly what they may use.
 */
export function registerTools(server: McpServer, deps: ToolDeps): string[] {
  const registered: string[] = [];
  for (const tool of TOOL_REGISTRY) {
    tool.register(server, deps);
    registered.push(tool.name);
  }
  return registered;
}
