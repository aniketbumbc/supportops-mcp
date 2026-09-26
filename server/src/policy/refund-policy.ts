import type { CustomerTier } from '../domain/type';

/**
 * Refund policy constants. Single source of truth,
 * used by get_customer_invoices now (outside_refund_window flag) and by
 * issue_refund in Phase 6 (the actual decision).
 */

/** Days after a successful payment during which it can be refunded without approval. */
export const REFUND_WINDOW_DAYS: Record<CustomerTier, number> = {
  standard: 30,
  business: 30,
  enterprise: 60,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the refund window for a payment closes.
 * The window is measured from the PAYMENT date, not the invoice date:
 * an invoice paid late still gets the full window.
 */
export function refundWindowEndsAt(
  paidAt: string | Date,
  tier: CustomerTier,
): Date {
  const paid = typeof paidAt === 'string' ? new Date(paidAt) : paidAt;
  return new Date(paid.getTime() + REFUND_WINDOW_DAYS[tier] * DAY_MS);
}

export function isOutsideRefundWindow(
  paidAt: string | Date,
  tier: CustomerTier,
  now: Date = new Date(),
): boolean {
  return now.getTime() > refundWindowEndsAt(paidAt, tier).getTime();
}
