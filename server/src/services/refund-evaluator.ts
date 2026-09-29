import type { BillingAdapter } from '../adapters/billing/billing-adapter';
import type { CrmAdapter } from '../adapters/crm/crm-adapter.js';
import { formatMoney } from '../domain/helper';
import { assertRef } from '../domain/refs';
import type { CustomerTier, Payment } from '../domain/type';
import { Errors } from '../errors/index';
import type { RequestContext } from '../gateway/context';
import {
  isOutsideRefundWindow,
  refundWindowEndsAt,
} from '../policy/refund-policy';
import type { EffectivePolicy } from '../policy/role-policy-store';

/**
 * The refund policy engine. Decides, for a requested refund, whether it may be
 * executed directly, needs a second person's approval, or is refused, and picks
 * which payment to refund. Reads only: no side effects. It runs on the preview AND
 * again on confirm, so a change in between (another refund, a suspension) is caught.
 *
 * Checks, in order (docs/tool-contract.md §5.7):
 *   1. invoice exists and belongs to the customer
 *   2. customer is active
 *   3. something is refundable, and the amount fits one payment
 *   4. payment is within the refund window, otherwise approval is required
 *   5. amount within the caller's direct limit → execute;
 *      within the approval limit → request approval; above → refused
 */

export type ApprovalReason = 'above_direct_limit' | 'outside_refund_window';

export interface RefundDecision {
  action: 'execute' | 'request_approval';
  /** Why approval is needed (empty when action is execute). */
  approvalReasons: ApprovalReason[];
  customer: { customerRef: string; name: string; tier: CustomerTier };
  invoiceNumber: string;
  /** The payment the refund will be made against. */
  paymentRef: string;
  amountMinor: number;
  currency: string;
  /** Total still refundable on the invoice, and on the chosen payment. */
  invoiceRefundableMinor: number;
  paymentRefundableMinor: number;
  refundWindowEndsAt: string;
  limits: { directMinor: number; approvalMinor: number };
  /** One-line, human-readable description, e.g. for the confirmation prompt. */
  summary: string;
}

export interface RefundRequest {
  customerRef: string;
  invoiceNumber: string;
  amountMinor: number;
}

const refundableOn = (p: Payment) =>
  p.status === 'succeeded'
    ? Math.max(p.amountMinor - p.amountRefundedMinor, 0)
    : 0;

export class RefundEvaluator {
  constructor(
    private readonly crm: CrmAdapter,
    private readonly billing: BillingAdapter,
  ) {}

  async evaluate(
    ctx: RequestContext,
    policy: EffectivePolicy,
    request: RefundRequest,
  ): Promise<RefundDecision> {
    const customerRef = assertRef(
      'customer',
      request.customerRef,
      'customer_ref',
    );
    const invoiceNumber = assertRef(
      'invoice',
      request.invoiceNumber,
      'invoice_number',
    );
    const amountMinor = request.amountMinor;
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw Errors.validation(
        'amount_minor must be a positive whole number of paise',
        {
          field: 'amount_minor',
        },
      );
    }

    // The caller must be allowed to refund at all.
    if (
      policy.directRefundLimitMinor <= 0 &&
      policy.approvalRefundLimitMinor <= 0
    ) {
      throw Errors.permissionDenied('Your role cannot issue refunds.');
    }

    const [customer, invoice] = await Promise.all([
      this.crm.getCustomer(ctx, customerRef),
      this.billing.getInvoice(ctx, invoiceNumber),
    ]);

    // 1. The invoice must belong to this customer. Answered as "not found" so the
    //    response never confirms that someone else's invoice exists.
    if (invoice.customerRef !== customerRef) {
      throw Errors.notFound('Invoice', `${invoiceNumber} for ${customerRef}`);
    }

    // 2. Only active customers can be refunded.
    if (customer.status !== 'active') {
      throw Errors.policyViolation(
        `${customer.name} is ${customer.status}; refunds are not allowed for ${customer.status} customers.`,
        { customer_status: customer.status },
      );
    }

    // 3. What can be refunded, and from which payment.
    const invoiceRefundableMinor = invoice.payments.reduce(
      (sum, p) => sum + refundableOn(p),
      0,
    );
    const money = (m: number) => formatMoney(m, invoice.currency);
    if (invoiceRefundableMinor === 0) {
      throw Errors.conflict(`Nothing left to refund on ${invoiceNumber}.`, {
        refundable_minor: 0,
      });
    }
    if (amountMinor > invoiceRefundableMinor) {
      throw Errors.conflict(
        `${money(amountMinor)} is more than the ${money(invoiceRefundableMinor)} still refundable on ${invoiceNumber}.`,
        { refundable_minor: invoiceRefundableMinor },
      );
    }

    // Newest successful payment that can cover the whole amount. For a duplicate
    // charge that is the second (later) payment, which is the one to give back.
    const candidates = invoice.payments
      .filter((p) => refundableOn(p) > 0 && p.paidAt)
      .sort((a, b) => Date.parse(b.paidAt!) - Date.parse(a.paidAt!));
    const payment = candidates.find((p) => refundableOn(p) >= amountMinor);
    if (!payment) {
      const largest = Math.max(...candidates.map(refundableOn));
      throw Errors.conflict(
        `A refund must come from a single payment; the most one payment can cover is ${money(largest)}. ` +
          'Split it into separate refunds.',
        { max_single_payment_refundable_minor: largest },
      );
    }

    // 4 + 5. Window and limits decide between execute and approval.
    const windowEnds = refundWindowEndsAt(payment.paidAt!, customer.tier);
    const reasons: ApprovalReason[] = [];
    if (isOutsideRefundWindow(payment.paidAt!, customer.tier))
      reasons.push('outside_refund_window');
    if (amountMinor > policy.directRefundLimitMinor)
      reasons.push('above_direct_limit');

    if (reasons.length > 0 && amountMinor > policy.approvalRefundLimitMinor) {
      throw Errors.policyViolation(
        `${money(amountMinor)} is above the ${money(policy.approvalRefundLimitMinor)} you can request. ` +
          'Ask someone with a higher limit (e.g. finance) to issue it.',
        { approval_limit_minor: policy.approvalRefundLimitMinor },
      );
    }

    const action = reasons.length === 0 ? 'execute' : 'request_approval';
    const why = reasons
      .map((r) =>
        r === 'outside_refund_window'
          ? `the refund window closed on ${windowEnds.toISOString().slice(0, 10)}`
          : `it is above your direct limit of ${money(policy.directRefundLimitMinor)}`,
      )
      .join(' and ');

    const summary =
      action === 'execute'
        ? `Refund ${money(amountMinor)} from ${invoiceNumber} (payment ${payment.paymentRef}) to ${customer.name}.`
        : `Request approval to refund ${money(amountMinor)} from ${invoiceNumber} (payment ${payment.paymentRef}) to ${customer.name}, because ${why}.`;

    return {
      action,
      approvalReasons: reasons,
      customer: { customerRef, name: customer.name, tier: customer.tier },
      invoiceNumber,
      paymentRef: payment.paymentRef,
      amountMinor,
      currency: invoice.currency,
      invoiceRefundableMinor,
      paymentRefundableMinor: refundableOn(payment),
      refundWindowEndsAt: windowEnds.toISOString(),
      limits: {
        directMinor: policy.directRefundLimitMinor,
        approvalMinor: policy.approvalRefundLimitMinor,
      },
      summary,
    };
  }
}
