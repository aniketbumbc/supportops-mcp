import type { BillingAdapter } from '../adapters/billing/billing-adapter';
import type { CrmAdapter } from '../adapters/crm/crm-adapter';
import { assertRef } from '../domain/refs';
import type { InvoiceStatus, InvoiceSummary } from '../domain/type';
import { Errors } from '../errors/index.js';
import type { RequestContext } from '../gateway/context';
import {
  isOutsideRefundWindow,
  refundWindowEndsAt,
} from '../policy/refund-policy';
import { decodeCursor, encodeCursor } from './cursor';

/**
 * Invoice statuses as the AI sees them. Billing only knows "paid"; the refund
 * states are derived here from the money facts.
 */
export const INVOICE_VIEW_STATUSES = [
  'draft',
  'open',
  'paid',
  'partially_refunded',
  'refunded',
  'void',
  'uncollectible',
] as const;
export type InvoiceViewStatus = (typeof INVOICE_VIEW_STATUSES)[number];

/** Statuses the tool lets the AI filter by (see docs/tool-contract.md §5.3). */
export const INVOICE_FILTER_STATUSES = [
  'open',
  'paid',
  'partially_refunded',
  'refunded',
  'void',
] as const;
export type InvoiceFilterStatus = (typeof INVOICE_FILTER_STATUSES)[number];

export const INVOICE_FLAGS = [
  'duplicate_payment_suspected',
  'outside_refund_window',
  'overdue',
] as const;
export type InvoiceFlag = (typeof INVOICE_FLAGS)[number];

export interface InvoiceView {
  invoiceNumber: string;
  status: InvoiceViewStatus;
  description: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  amountMinor: number;
  amountPaidMinor: number;
  amountRefundedMinor: number;
  /** Paid minus already refunded. Computed here, never by the AI. */
  refundableMinor: number;
  /** When the refund window closes, if anything is refundable. */
  refundWindowEndsAt: string | null;
  currency: string;
  paymentCount: number;
  flags: InvoiceFlag[];
}

export interface ListInvoicesResult {
  invoices: InvoiceView[];
  nextCursor: string | null;
}

export const INVOICE_LIMIT = { default: 10, max: 25 } as const;

/** How many invoices to read per upstream call, and the most calls per request. */
const BATCH_SIZE = 25;
const MAX_UPSTREAM_CALLS = 8;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Which billing-system status to ask for, for each filter the AI can use. */
const UPSTREAM_STATUS: Record<InvoiceFilterStatus, InvoiceStatus> = {
  open: 'open',
  paid: 'paid',
  partially_refunded: 'paid',
  refunded: 'paid',
  void: 'void',
};

function deriveStatus(inv: InvoiceSummary): InvoiceViewStatus {
  if (inv.status === 'paid' && inv.amountRefundedMinor > 0) {
    return inv.amountRefundedMinor >= inv.amountPaidMinor
      ? 'refunded'
      : 'partially_refunded';
  }
  return inv.status;
}

function parseDate(
  value: string | undefined,
  field: string,
  endOfDay: boolean,
): string | undefined {
  if (value === undefined) return undefined;
  const date = new Date(
    `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`,
  );
  if (!ISO_DATE.test(value) || Number.isNaN(date.getTime())) {
    throw Errors.validation(`${field} must be a date like 2026-09-01`, {
      field,
      received: value,
    });
  }
  return date.toISOString();
}

export class BillingService {
  constructor(
    private readonly billing: BillingAdapter,
    private readonly crm: CrmAdapter,
  ) {}

  async listInvoices(
    ctx: RequestContext,
    input: {
      customerRef: string;
      status?: InvoiceFilterStatus;
      fromDate?: string;
      toDate?: string;
      limit?: number;
      cursor?: string;
    },
  ): Promise<ListInvoicesResult> {
    const customerRef = assertRef(
      'customer',
      input.customerRef,
      'customer_ref',
    );
    const from = parseDate(input.fromDate, 'from_date', false);
    const to = parseDate(input.toDate, 'to_date', true);
    if (from && to && from > to) {
      throw Errors.validation('from_date must be on or before to_date', {
        field: 'from_date',
      });
    }
    const limit = Math.min(
      Math.max(input.limit ?? INVOICE_LIMIT.default, 1),
      INVOICE_LIMIT.max,
    );

    // The cursor is bound to these filters; limit may change between pages.
    const scope = { customerRef, status: input.status, from, to };
    let offset = decodeCursor(input.cursor, scope);

    // Tier decides the refund window. Started now, awaited after the invoices.
    const customerPromise = this.crm.getCustomer(ctx, customerRef);
    customerPromise.catch(() => {}); // avoid an unhandled rejection if invoices fail first

    // Read batches until the page is full. Needed because the refund statuses
    // are filtered here, not by the billing system.
    const collected: InvoiceSummary[] = [];
    let more = true;
    for (
      let calls = 0;
      collected.length < limit && more && calls < MAX_UPSTREAM_CALLS;
      calls++
    ) {
      const page = await this.billing.listInvoices(ctx, {
        customerRef,
        status: input.status ? UPSTREAM_STATUS[input.status] : undefined,
        from,
        to,
        limit: BATCH_SIZE,
        offset,
      });
      let consumed = 0;
      for (const invoice of page.items) {
        consumed++;
        if (!input.status || deriveStatus(invoice) === input.status) {
          collected.push(invoice);
          if (collected.length === limit) break;
        }
      }
      offset += consumed;
      more = consumed < page.items.length || page.hasMore;
    }

    const customer = await customerPromise;
    const now = new Date();

    const invoices = collected.map((inv): InvoiceView => {
      const refundableMinor = Math.max(
        inv.amountPaidMinor - inv.amountRefundedMinor,
        0,
      );
      // Window runs from the most recent successful payment.
      const paymentDate = inv.lastPaymentAt ?? inv.paidAt;

      const flags: InvoiceFlag[] = [];
      if (inv.successfulPaymentCount > 1 && refundableMinor > inv.amountMinor) {
        flags.push('duplicate_payment_suspected');
      }
      if (
        refundableMinor > 0 &&
        paymentDate &&
        isOutsideRefundWindow(paymentDate, customer.tier, now)
      ) {
        flags.push('outside_refund_window');
      }
      if (inv.status === 'open' && new Date(inv.dueAt) < now) {
        flags.push('overdue');
      }

      return {
        invoiceNumber: inv.invoiceNumber,
        status: deriveStatus(inv),
        description: inv.description,
        issuedAt: inv.issuedAt,
        dueAt: inv.dueAt,
        paidAt: inv.paidAt,
        amountMinor: inv.amountMinor,
        amountPaidMinor: inv.amountPaidMinor,
        amountRefundedMinor: inv.amountRefundedMinor,
        refundableMinor,
        refundWindowEndsAt:
          refundableMinor > 0 && paymentDate
            ? refundWindowEndsAt(paymentDate, customer.tier).toISOString()
            : null,
        currency: inv.currency,
        paymentCount: inv.successfulPaymentCount,
        flags,
      };
    });

    ctx.log.debug(
      { customerRef, status: input.status, returned: invoices.length },
      'listInvoices',
    );
    return { invoices, nextCursor: more ? encodeCursor(offset, scope) : null };
  }
}
