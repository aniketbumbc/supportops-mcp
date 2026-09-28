import type {
  InvoiceDetail,
  InvoiceStatus,
  InvoiceSummary,
  Page,
  Refund,
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

export interface CreateRefundInput {
  paymentRef: string;
  amountMinor: number;
  reason: string;
  /** Extra context stored with the refund at the provider (who, why, which approval). */
  metadata: Record<string, string | number | boolean | null>;
}

export interface CreatedRefund extends Refund {
  invoiceNumber: string;
}

/**
 * What the rest of the system needs from a billing / payments system.
 * The mock today; Stripe, Razorpay or Chargebee later.
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

  /**
   * Refunds part or all of one payment. Idempotent at the provider: the same key
   * returns the original refund instead of refunding twice. Throws CONFLICT if the
   * amount exceeds what is refundable on that payment or the payment isn't refundable.
   */
  createRefund(
    ctx: RequestContext,
    input: CreateRefundInput,
    idempotencyKey: string,
  ): Promise<CreatedRefund>;
}
