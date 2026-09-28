import { z } from 'zod';
import { CUSTOMER_STATUSES, CUSTOMER_TIERS } from '../domain/types';
import type { ToolName } from '../policy/tool-names';
import { defineTool } from './define-tool';

export const UPDATE_CUSTOMER = 'update_customer' satisfies ToolName;

export const updateCustomerTool = defineTool({
  name: UPDATE_CUSTOMER,
  title: 'Update customer',
  description: [
    "Change a customer's details. Give only the fields to change.",
    'Support agents may change name, primary_email, phone and region only; tier and status need',
    'a support lead or admin. Changing status (e.g. suspending) requires a reason and has big',
    'effects (a suspended customer cannot be refunded): confirm with the user first.',
    'phone: null clears the phone number.',
  ].join(' '),
  inputSchema: {
    customer_ref: z.string().describe('Customer reference, e.g. CUS-1001.'),
    name: z.string().optional(),
    primary_email: z.string().optional(),
    phone: z.string().nullable().optional(),
    region: z.string().optional(),
    tier: z.enum(CUSTOMER_TIERS).optional(),
    status: z.enum(CUSTOMER_STATUSES).optional(),
    reason: z
      .string()
      .optional()
      .describe('Required with status: why, 10 to 500 characters.'),
  },
  outputSchema: {
    customer_ref: z.string(),
    changes_applied: z.array(z.string()),
    customer: z.object({
      name: z.string(),
      primary_email: z.string(),
      phone: z.string().nullable(),
      tier: z.enum(CUSTOMER_TIERS),
      status: z.enum(CUSTOMER_STATUSES),
      region: z.string(),
    }),
    replayed: z.boolean(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },

  handler: async (args, { services, ctx }) => {
    const r = await services.customers.updateCustomer(ctx, {
      customerRef: args.customer_ref,
      name: args.name,
      primaryEmail: args.primary_email,
      phone: args.phone,
      region: args.region,
      tier: args.tier,
      status: args.status,
      reason: args.reason,
    });
    const c = r.customer;
    return {
      structured: {
        customer_ref: c.customerRef,
        changes_applied: r.changesApplied,
        customer: {
          name: c.name,
          primary_email: c.primaryEmail,
          phone: c.phone,
          tier: c.tier,
          status: c.status,
          region: c.region,
        },
        replayed: r.replayed,
      },
      summary:
        r.changesApplied.length > 0
          ? `${c.name} (${c.customerRef}): ${r.changesApplied.join('; ')}.`
          : `${c.name} (${c.customerRef}): nothing changed.`,
      audit: { customer_ref: c.customerRef, changes: r.changesApplied },
    };
  },
});
