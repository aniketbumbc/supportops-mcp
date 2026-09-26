import type {
  InvoiceDetail,
  InvoiceStatus,
  InvoiceSummary,
  Page,
  Subscription,
} from '../../domain/type';
import type { RequestContext } from '../../gateway/context';

export interface ListInvoicesParams {
  customerRef: string;
  status?: InvoiceStatus;
  /** ISO date: only invoices issued on or after this. */
  from?: string;
  /** ISO date: only invoices issued on or before this. */
  to?: string;
  limit: number;
  offset?: number;
}

/**
 * What the rest of the system needs from a billing / payments system.
 * The mock today; Stripe, Razorpay or Chargebee later.
 * Refund creation is added in Phase 6 with issue_refund.
 */
export interface BillingAdapter {
  /** Throws NOT_FOUND if the customer does not exist. */
  listSubscriptions(
    ctx: RequestContext,
    customerRef: string,
  ): Promise<Subscription[]>;

  /** Newest first. Throws NOT_FOUND if the customer does not exist. */
  listInvoices(
    ctx: RequestContext,
    params: ListInvoicesParams,
  ): Promise<Page<InvoiceSummary>>;

  /** Invoice with lines, payments and refunds. Throws NOT_FOUND if it does not exist. */
  getInvoice(
    ctx: RequestContext,
    invoiceNumber: string,
  ): Promise<InvoiceDetail>;
}
