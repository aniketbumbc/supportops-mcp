import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { canUseTool } from '../policy/role-policy-store';
import type { ToolEntry } from './define-tool';
import { findCustomerTool } from './find-customer';
import { getCustomerAccountTool } from './get-customer-account';
import { getCustomerInvoicesTool } from './get-customer-invoices';
import { searchCustomerTicketsTool } from './search-customer-tickets';
import type { ToolDeps } from './types';

/**
 * Every tool the server can expose. Add one line per new tool.
 * Tools are built with defineTool(), so each gets permission checks, timing,
 * audit rows and error mapping automatically.
 */
export const TOOL_REGISTRY: ToolEntry[] = [
  findCustomerTool,
  getCustomerAccountTool,
  getCustomerInvoicesTool,
  searchCustomerTicketsTool,
];

/**
 * Registers only the tools the caller's roles allow, so tools/list shows each user
 * exactly what they may use. A tool that isn't registered can't be called: the
 * SDK answers "Tool ... not found", the same as for a tool that doesn't exist.
 */
export function registerTools(server: McpServer, deps: ToolDeps): string[] {
  const allowed = TOOL_REGISTRY.filter((tool) =>
    canUseTool(deps.policy, tool.name),
  );

  if (allowed.length === 0) {
    // With no tools the SDK would answer tools/list with "Method not found", which
    // looks like a broken server. Registering and removing a placeholder makes it
    // declare the tools capability and return an empty list instead.
    server
      .registerTool(
        '__no_tools__',
        { description: 'placeholder' },
        async () => ({ content: [] }),
      )
      .remove();
  }

  for (const tool of allowed) tool.register(server, deps);
  return allowed.map((tool) => tool.name);
}
