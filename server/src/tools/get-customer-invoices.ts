import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toToolError } from '../errors/index';
import type { ToolName } from '../policy/tool-names';
import {
  INVOICE_FILTER_STATUSES,
  INVOICE_FLAGS,
  INVOICE_LIMIT,
  INVOICE_VIEW_STATUSES,
} from '../services/billing-service.js';
import { toolSuccess } from './helper';
import type { ToolDeps } from './type';

export const GET_CUSTOMER_INVOICES = 'get_customer_invoices' satisfies ToolName;

const inputSchema = {
  customer_ref: z
    .string()
    .describe('Customer reference from find_customer, e.g. CUS-1001.'),
  status: z
    .enum(INVOICE_FILTER_STATUSES)
    .optional()
    .describe('Only invoices with this status. Omit for all.'),
  from_date: z
    .string()
    .optional()
    .describe('Only invoices issued on or after this date, YYYY-MM-DD.'),
  to_date: z
    .string()
    .optional()
    .describe('Only invoices issued on or before this date, YYYY-MM-DD.'),
  limit: z
    .number()
    .int()
    .optional()
    .describe(
      `Invoices per page, 1 to ${INVOICE_LIMIT.max}. Default ${INVOICE_LIMIT.default}.`,
    ),
  cursor: z
    .string()
    .optional()
    .describe(
      'next_cursor from a previous call, to get the next page. Omit for the first page.',
    ),
};

/** Matches docs/tool-contract.md §5.3. */
const outputSchema = {
  invoices: z.array(
    z.object({
      invoice_number: z.string(),
      status: z.enum(INVOICE_VIEW_STATUSES),
      description: z.string(),
      issued_at: z.string(),
      due_at: z.string(),
      paid_at: z.string().nullable(),
      amount_minor: z.number().int(),
      amount_paid_minor: z.number().int(),
      amount_refunded_minor: z.number().int(),
      refundable_minor: z.number().int(),
      refund_window_ends_at: z.string().nullable(),
      currency: z.string(),
      payment_count: z.number().int(),
      flags: z.array(z.enum(INVOICE_FLAGS)),
    }),
  ),
  next_cursor: z.string().nullable(),
};

export function registerGetCustomerInvoices(
  server: McpServer,
  { services, ctx }: ToolDeps,
): void {
  server.registerTool(
    GET_CUSTOMER_INVOICES,
    {
      title: 'Get customer invoices',
      description: [
        "List a customer's invoices, newest first, with payment and refund state.",
        'Amounts are in minor units (paise): divide by 100.',
        'refundable_minor is calculated by the server: use it as-is, never calculate refunds yourself.',
        'Flags: duplicate_payment_suspected = paid more than once;',
        'outside_refund_window = refund needs approval (window closed at refund_window_ends_at);',
        'overdue = unpaid and past due.',
        'If next_cursor is not null, more invoices exist: pass it back as cursor to get them.',
      ].join(' '),
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ customer_ref, status, from_date, to_date, limit, cursor }) => {
      try {
        const result = await services.billing.listInvoices(ctx, {
          customerRef: customer_ref,
          status,
          fromDate: from_date,
          toDate: to_date,
          limit,
          cursor,
        });

        const structured = {
          invoices: result.invoices.map((i) => ({
            invoice_number: i.invoiceNumber,
            status: i.status,
            description: i.description,
            issued_at: i.issuedAt,
            due_at: i.dueAt,
            paid_at: i.paidAt,
            amount_minor: i.amountMinor,
            amount_paid_minor: i.amountPaidMinor,
            amount_refunded_minor: i.amountRefundedMinor,
            refundable_minor: i.refundableMinor,
            refund_window_ends_at: i.refundWindowEndsAt,
            currency: i.currency,
            payment_count: i.paymentCount,
            flags: i.flags,
          })),
          next_cursor: result.nextCursor,
        };

        const flagged = result.invoices.filter((i) => i.flags.length > 0);
        const summary = [
          `${result.invoices.length} invoice(s) for ${customer_ref.trim().toUpperCase()}.`,
          ...flagged.map((i) => `${i.invoiceNumber}: ${i.flags.join(', ')}.`),
          result.nextCursor ? 'More invoices available (use next_cursor).' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return toolSuccess(structured, summary);
      } catch (error) {
        return toToolError(error, {
          correlationId: ctx.correlationId,
          log: ctx.log,
          toolName: GET_CUSTOMER_INVOICES,
        });
      }
    },
  );
}
