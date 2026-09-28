import { z } from 'zod';
import { CUSTOMER_TIERS } from '../domain/type';
import type { ToolName } from '../policy/tool-names';
import { defineTool } from './define-tool';

export const CREATE_CUSTOMER = 'create_customer' satisfies ToolName;

export const createCustomerTool = defineTool({
  name: CREATE_CUSTOMER,
  title: 'Create customer',
  description: [
    'Create a new customer with a primary contact.',
    'The server first checks for duplicates. If status is "possible_duplicates_found", nothing was',
    'created: show the user possible_duplicates and ask whether it is one of them. Only if the user',
    'confirms it is a NEW customer, call again with confirm_not_duplicate: true.',
    'An email already used by another customer is always refused.',
  ].join(' '),
  inputSchema: {
    name: z.string().describe('Company name, 2 to 150 characters.'),
    primary_email: z.string().describe('Billing / main email for the company.'),
    phone: z.string().optional(),
    tier: z.enum(CUSTOMER_TIERS).optional().describe('Default standard.'),
    region: z.string().describe('e.g. IN-West.'),
    contact_name: z.string().describe("Primary contact's name."),
    contact_email: z.string().describe("Primary contact's email."),
    contact_role: z.string().describe('e.g. Finance Manager.'),
    confirm_not_duplicate: z
      .boolean()
      .optional()
      .describe(
        'Set true ONLY after the user confirmed this is not one of the possible duplicates.',
      ),
  },
  outputSchema: {
    status: z.enum(['created', 'possible_duplicates_found']),
    customer_ref: z.string().nullable(),
    name: z.string().nullable(),
    possible_duplicates: z.array(
      z.object({
        customer_ref: z.string(),
        name: z.string(),
        primary_email: z.string(),
        reason: z.string(),
      }),
    ),
    replayed: z.boolean(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },

  handler: async (args, { services, ctx }) => {
    const r = await services.customers.createCustomer(ctx, {
      name: args.name,
      primaryEmail: args.primary_email,
      phone: args.phone,
      tier: args.tier,
      region: args.region,
      contactName: args.contact_name,
      contactEmail: args.contact_email,
      contactRole: args.contact_role,
      confirmNotDuplicate: args.confirm_not_duplicate,
    });

    if (r.status === 'possible_duplicates_found') {
      return {
        structured: {
          status: r.status,
          customer_ref: null,
          name: null,
          possible_duplicates: r.possibleDuplicates.map((d) => ({
            customer_ref: d.customerRef,
            name: d.name,
            primary_email: d.primaryEmail,
            reason: d.reason,
          })),
          replayed: false,
        },
        summary:
          `Not created: ${r.possibleDuplicates.length} similar customer(s) already exist ` +
          `(${r.possibleDuplicates.map((d) => `${d.name} ${d.customerRef}`).join(', ')}). Ask the user.`,
        audit: {
          status: r.status,
          candidates: r.possibleDuplicates.map((d) => d.customerRef),
        },
      };
    }

    return {
      structured: {
        status: r.status,
        customer_ref: r.customer.customerRef,
        name: r.customer.name,
        possible_duplicates: [],
        replayed: r.replayed,
      },
      summary: r.replayed
        ? `${r.customer.name} (${r.customer.customerRef}) was already created by this same request.`
        : `Created ${r.customer.name} (${r.customer.customerRef}).`,
      audit: { customer_ref: r.customer.customerRef, replayed: r.replayed },
    };
  },
});
