import { z } from 'zod';
import { CUSTOMER_STATUSES, CUSTOMER_TIERS } from '../domain/type';
import type { ToolName } from '../policy/tool-names';
import { FIND_LIMIT } from '../services/customer-service';
import { defineTool } from './define-tool';

export const FIND_CUSTOMER = 'find_customer' satisfies ToolName;

export const findCustomerTool = defineTool({
  name: FIND_CUSTOMER,
  title: 'Find customer',
  description: [
    'Find customers by name, company, email or customer reference (e.g. CUS-1001).',
    'Call this first whenever the user mentions a customer; other tools need the customer_ref it returns.',
    'If more than one customer matches, list them and ask the user which one they mean. Never guess.',
    'If has_more is true, ask the user for a more specific name.',
  ].join(' '),
  // Types and descriptions only: range rules are enforced by CustomerService so
  // violations come back as our own VALIDATION_ERROR.
  inputSchema: {
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
  },
  /** Matches docs/tool-contract.md §5.1. */
  outputSchema: {
    matches: z.array(
      z.object({
        customer_ref: z.string(),
        name: z.string(),
        primary_email: z.string(),
        tier: z.enum(CUSTOMER_TIERS),
        status: z.enum(CUSTOMER_STATUSES),
        region: z.string(),
      }),
    ),
    total_matches: z.number().int(),
    has_more: z.boolean(),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },

  handler: async ({ query, limit }, { services, ctx }) => {
    const result = await services.customers.findCustomers(ctx, {
      query,
      limit,
    });

    const summary =
      result.totalMatches === 0
        ? `No customers match "${query.trim()}".`
        : result.totalMatches === 1
          ? `Found 1 customer: ${result.matches[0]!.name} (${result.matches[0]!.customerRef}).`
          : `Found ${result.totalMatches} customers matching "${query.trim()}". Ask the user which one they mean.`;

    return {
      structured: {
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
      },
      summary,
      audit: { matches: result.totalMatches },
    };
  },
});
