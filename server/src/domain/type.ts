/**
 * Our own business types. Vendor-neutral and camelCase.
 * Adapters convert each vendor's JSON into these; services and tools only ever see these.
 *
 * Conventions:
 * - Money is always integer minor units (paise) plus an ISO currency code.
 * - Dates are ISO 8601 strings.
 * - Allowed values are `as const` arrays, so Zod schemas in adapters and tools
 *   can reuse them (z.enum(INVOICE_STATUSES)) and never drift from the types.
 */

// ─── Shared ──────────────────────────────────────────────

/** One page of results from a list call. */
export interface Page<T> {
  items: T[];
  hasMore: boolean;
  nextOffset: number | null;
}

// ─── Customers (CRM) ─────────────────────────────────────

export const CUSTOMER_TIERS = ['standard', 'business', 'enterprise'] as const;
export const CUSTOMER_STATUSES = ['active', 'suspended', 'churned'] as const;

export type CustomerTier = (typeof CUSTOMER_TIERS)[number];
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface Customer {
  customerRef: string;
  name: string;
  primaryEmail: string;
  phone: string | null;
  tier: CustomerTier;
  status: CustomerStatus;
  region: string;
  /** ISO 8601 date the customer relationship started. */
  customerSince: string;
}

export interface Contact {
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isPrimary: boolean;
}

export interface CustomerDetail extends Customer {
  contacts: Contact[];
}

// ─── Billing ─────────────────────────────────────────────

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
] as const;
export const BILLING_CYCLES = ['monthly', 'annual'] as const;
/** Statuses as the billing system stores them. Refund states are derived later, in BillingService. */
export const INVOICE_STATUSES = [
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible',
] as const;
export const PAYMENT_METHODS = [
  'card',
  'upi',
  'netbanking',
  'bank_transfer',
] as const;
export const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export const REFUND_STATUSES = ['pending', 'succeeded', 'failed'] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export interface Subscription {
  subscriptionRef: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  amountMinor: number;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

/** Fields every invoice has, in both list and detail views. */
interface InvoiceBase {
  invoiceNumber: string;
  customerRef: string;
  status: InvoiceStatus;
  description: string;
  amountMinor: number;
  currency: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
}

/**
 * An invoice in a list, with its money state as reported by the billing system.
 * Refundable amount and flags are NOT here: they are business decisions, computed
 * by BillingService from these facts.
 */
export interface InvoiceSummary extends InvoiceBase {
  amountPaidMinor: number;
  amountRefundedMinor: number;
  successfulPaymentCount: number;
  lastPaymentAt: string | null;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitAmountMinor: number;
  amountMinor: number;
}

export interface Payment {
  paymentRef: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  failureReason: string | null;
  paidAt: string | null;
  /** Total already refunded against this payment (pending + succeeded). */
  amountRefundedMinor: number;
}

export interface Refund {
  refundRef: string;
  paymentRef: string;
  amountMinor: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  createdAt: string;
}

/** One invoice with everything attached. Used by issue_refund in Phase 6. */
export interface InvoiceDetail extends InvoiceBase {
  lines: InvoiceLine[];
  payments: Payment[];
  refunds: Refund[];
}

// ─── Support (ticketing) ─────────────────────────────────

export const TICKET_STATUSES = [
  'open',
  'pending',
  'resolved',
  'closed',
] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_CATEGORIES = [
  'billing',
  'technical',
  'account',
  'other',
] as const;
export const COMMENT_AUTHOR_TYPES = ['customer', 'agent', 'system'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type CommentAuthorType = (typeof COMMENT_AUTHOR_TYPES)[number];

export interface Ticket {
  ticketNumber: string;
  customerRef: string;
  subject: string;
  /** Written by the customer: untrusted text. Tools must return it as data only. */
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  assignee: string | null;
  relatedInvoiceNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  author: string;
  authorType: CommentAuthorType;
  /** Untrusted when authorType is 'customer'. */
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  comments: TicketComment[];
}
