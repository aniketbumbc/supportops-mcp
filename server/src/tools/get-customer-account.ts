import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  BILLING_CYCLES,
  CUSTOMER_STATUSES,
  CUSTOMER_TIERS,
  SUBSCRIPTION_STATUSES,
} from '../domain/type';
import { toToolError } from '../errors/index';
import type { ToolName } from '../policy/tool-names';
import { formatMoney, toolSuccess } from './helper';
import type { ToolDeps } from './type';

export const GET_CUSTOMER_ACCOUNT = 'get_customer_account' satisfies ToolName;

const inputSchema = {
  customer_ref: z
    .string()
    .describe('Customer reference from find_customer, e.g. CUS-1001.'),
};

/** Matches docs/tool-contract.md §5.2. */
const outputSchema = {
  customer_ref: z.string(),
  name: z.string(),
  tier: z.enum(CUSTOMER_TIERS),
  status: z.enum(CUSTOMER_STATUSES),
  region: z.string(),
  customer_since: z.string(),
  primary_contact: z
    .object({ name: z.string(), email: z.string(), role: z.string() })
    .nullable(),
  subscriptions: z
    .array(
      z.object({
        subscription_ref: z.string(),
        plan: z.string(),
        status: z.enum(SUBSCRIPTION_STATUSES),
        billing_cycle: z.enum(BILLING_CYCLES),
        amount_minor: z.number().int(),
        currency: z.string(),
        renews_at: z.string().nullable(),
      }),
    )
    .nullable(),
  balance: z
    .object({
      open_invoices: z.number().int(),
      amount_due_minor: z.number().int(),
      currency: z.string(),
    })
    .nullable(),
  support: z
    .object({
      open_tickets: z.number().int(),
      last_ticket_at: z.string().nullable(),
    })
    .nullable(),
  unavailable_sections: z.array(
    z.enum(['subscriptions', 'balance', 'support']),
  ),
};

export function registerGetCustomerAccount(
  server: McpServer,
  { services, ctx }: ToolDeps,
): void {
  server.registerTool(
    GET_CUSTOMER_ACCOUNT,
    {
      title: 'Get customer account',
      description: [
        'Account overview for one customer: profile, tier and status, primary contact,',
        'subscriptions, balance due and open support tickets.',
        'Use the customer_ref returned by find_customer. Amounts are in minor units (paise): divide by 100.',
        'If unavailable_sections is not empty, those systems are temporarily down: tell the user',
        'that part is unavailable right now instead of guessing.',
      ].join(' '),
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ customer_ref }) => {
      try {
        const a = await services.customers.getAccount(ctx, {
          customerRef: customer_ref,
        });

        const structured = {
          customer_ref: a.customerRef,
          name: a.name,
          tier: a.tier,
          status: a.status,
          region: a.region,
          customer_since: a.customerSince,
          primary_contact: a.primaryContact,
          subscriptions:
            a.subscriptions?.map((s) => ({
              subscription_ref: s.subscriptionRef,
              plan: s.planName,
              status: s.status,
              billing_cycle: s.billingCycle,
              amount_minor: s.amountMinor,
              currency: s.currency,
              renews_at: s.renewsAt,
            })) ?? null,
          balance: a.balance && {
            open_invoices: a.balance.openInvoices,
            amount_due_minor: a.balance.amountDueMinor,
            currency: a.balance.currency,
          },
          support: a.support && {
            open_tickets: a.support.openTickets,
            last_ticket_at: a.support.lastTicketActivityAt,
          },
          unavailable_sections: a.unavailableSections,
        };

        const parts = [
          `${a.name} (${a.customerRef}), ${a.tier} tier, ${a.status}.`,
        ];
        if (a.balance)
          parts.push(
            `${formatMoney(a.balance.amountDueMinor, a.balance.currency)} due.`,
          );
        if (a.support) parts.push(`${a.support.openTickets} open ticket(s).`);
        if (a.unavailableSections.length > 0) {
          parts.push(
            `Unavailable right now: ${a.unavailableSections.join(', ')}.`,
          );
        }

        return toolSuccess(structured, parts.join(' '));
      } catch (error) {
        return toToolError(error, {
          correlationId: ctx.correlationId,
          log: ctx.log,
          toolName: GET_CUSTOMER_ACCOUNT,
        });
      }
    },
  );
}
