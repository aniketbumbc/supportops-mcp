import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { toToolError } from '../errors/index';
import { FIND_LIMIT } from '../services/customer-service';
import type { ToolDeps } from './types';
import type { ToolName } from '../policy/tool-names';

export const FIND_CUSTOMER = 'find_customer' as ToolName;

/**
 * Input schema: types and descriptions only. Range rules (2–100 characters,
 * limit 1–10) are enforced by CustomerService, so violations come back in our
 * own VALIDATION_ERROR format instead of the SDK's plain-text message.
 */
const inputSchema = {
  query: z
    .string()
    .describe(
      'Customer name, company name, email address or customer reference such as CUS-1001. 2 to 100 characters.',
    ),
  limit: z
    .number()
    .int()
    .optional()
    .describe(
      `Maximum matches to return, 1 to ${FIND_LIMIT.max}. Default ${FIND_LIMIT.default}.`,
    ),
};

/** Output schema: matches docs/tool-contract.md §5.1. The SDK validates every success against it. */
const outputSchema = {
  matches: z.array(
    z.object({
      customer_ref: z.string(),
      name: z.string(),
      primary_email: z.string(),
      tier: z.enum(['standard', 'business', 'enterprise']),
      status: z.enum(['active', 'suspended', 'churned']),
      region: z.string(),
    }),
  ),
  total_matches: z.number().int(),
  has_more: z.boolean(),
};

export function registerFindCustomer(
  server: McpServer,
  { services, ctx }: ToolDeps,
): void {
  server.registerTool(
    FIND_CUSTOMER,
    {
      title: 'Find customer',
      description: [
        'Find customers by name, company, email or customer reference (e.g. CUS-1001).',
        'Call this first whenever the user mentions a customer; other tools need the customer_ref it returns.',
        'If more than one customer matches, list them and ask the user which one they mean. Never guess.',
        'If has_more is true, ask the user for a more specific name.',
      ].join(' '),
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit }) => {
      try {
        const result = await services.customers.findCustomers(ctx, {
          query,
          limit,
        });

        const structured = {
          matches: result.matches.map((m) => ({
            customer_ref: m.customerRef,
            name: m.name,
            primary_email: m.primaryEmail,
            tier: m.tier,
            status: m.status,
            region: m.region,
          })),
          total_matches: result.totalMatches,
          has_more: result.hasMore,
        };

        const summary =
          result.totalMatches === 0
            ? `No customers match "${query.trim()}".`
            : result.totalMatches === 1
              ? `Found 1 customer: ${result.matches[0]!.name} (${result.matches[0]!.customerRef}).`
              : `Found ${result.totalMatches} customers matching "${query.trim()}". Ask the user which one they mean.`;

        return {
          structuredContent: structured,
          // Text copy for clients that don't read structuredContent.
          content: [
            { type: 'text', text: `${summary}\n${JSON.stringify(structured)}` },
          ],
        };
      } catch (error) {
        return toToolError(error, {
          correlationId: ctx.correlationId,
          log: ctx.log,
          toolName: FIND_CUSTOMER,
        });
      }
    },
  );
}
