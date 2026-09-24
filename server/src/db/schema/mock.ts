/**
 * "mock" schema: stands in for the external systems of record
 * (CRM, billing, payments, ticketing). In production these would be
 * separate vendor systems; the MCP server only reaches them through adapters.
 */
import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const mockSchema = pgSchema('mock');

// ─── Enums ───────────────────────────────────────────────
export const customerTier = mockSchema.enum('customer_tier', [
  'standard',
  'business',
  'enterprise',
]);
export const customerStatus = mockSchema.enum('customer_status', [
  'active',
  'suspended',
  'churned',
]);
export const subscriptionStatus = mockSchema.enum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'cancelled',
]);
export const billingCycle = mockSchema.enum('billing_cycle', [
  'monthly',
  'annual',
]);
export const invoiceStatus = mockSchema.enum('invoice_status', [
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible',
]);
export const paymentMethod = mockSchema.enum('payment_method', [
  'card',
  'upi',
  'netbanking',
  'bank_transfer',
]);
export const paymentStatus = mockSchema.enum('payment_status', [
  'pending',
  'succeeded',
  'failed',
]);
export const refundStatus = mockSchema.enum('refund_status', [
  'pending',
  'succeeded',
  'failed',
]);
export const ticketStatus = mockSchema.enum('ticket_status', [
  'open',
  'pending',
  'resolved',
  'closed',
]);
export const ticketPriority = mockSchema.enum('ticket_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);
export const ticketCategory = mockSchema.enum('ticket_category', [
  'billing',
  'technical',
  'account',
  'other',
]);
export const commentAuthorType = mockSchema.enum('comment_author_type', [
  'customer',
  'agent',
  'system',
]);
export const subscriptionRefSeq = mockSchema.sequence('subscription_ref_seq', {
  startWith: 1,
});
export const paymentRefSeq = mockSchema.sequence('payment_ref_seq', {
  startWith: 1,
});

// ─── Sequences for human-readable references ─────────────
export const ticketNumberSeq = mockSchema.sequence('ticket_number_seq', {
  startWith: 1001,
});
export const refundRefSeq = mockSchema.sequence('refund_ref_seq', {
  startWith: 1,
});
export const customerRefSeq = mockSchema.sequence('customer_ref_seq', {
  startWith: 5001,
});

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

// ─── CRM ─────────────────────────────────────────────────
export const customers = mockSchema.table(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerRef: text('customer_ref').notNull().unique(),
    tenantId: text('tenant_id').notNull().default('default'),
    name: text('name').notNull(),
    primaryEmail: text('primary_email').notNull(),
    phone: text('phone'),
    tier: customerTier('tier').notNull(),
    status: customerStatus('status').notNull().default('active'),
    region: text('region').notNull(),
    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('customers_tenant_idx').on(t.tenantId),
    index('customers_name_idx').on(t.name),
  ],
);

export const contacts = mockSchema.table(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    role: text('role').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('contacts_customer_idx').on(t.customerId)],
);

// ─── Billing ─────────────────────────────────────────────
export const subscriptions = mockSchema.table(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionRef: text('subscription_ref').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    planName: text('plan_name').notNull(),
    status: subscriptionStatus('status').notNull(),
    billingCycle: billingCycle('billing_cycle').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', {
      withTimezone: true,
    }).notNull(),
    idempotencyKey: text('idempotency_key').unique(),
    ...timestamps,
  },
  (t) => [index('subscriptions_customer_idx').on(t.customerId)],
);

export const invoices = mockSchema.table(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceNumber: text('invoice_number').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    status: invoiceStatus('status').notNull(),
    description: text('description').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('invoices_customer_idx').on(t.customerId),
    index('invoices_issued_idx').on(t.issuedAt),
  ],
);

export const invoiceLines = mockSchema.table(
  'invoice_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitAmountMinor: integer('unit_amount_minor').notNull(),
    amountMinor: integer('amount_minor').notNull(),
  },
  (t) => [index('invoice_lines_invoice_idx').on(t.invoiceId)],
);

// ─── Payments ────────────────────────────────────────────
export const payments = mockSchema.table(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentRef: text('payment_ref').notNull().unique(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    method: paymentMethod('method').notNull(),
    status: paymentStatus('status').notNull(),
    failureReason: text('failure_reason'),
    providerRef: text('provider_ref').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('payments_invoice_idx').on(t.invoiceId),
    index('payments_customer_idx').on(t.customerId),
  ],
);

export const refunds = mockSchema.table(
  'refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    refundRef: text('refund_ref').notNull().unique(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    reason: text('reason').notNull(),
    status: refundStatus('status').notNull(),
    idempotencyKey: text('idempotency_key').unique(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ...timestamps,
  },
  (t) => [
    index('refunds_payment_idx').on(t.paymentId),
    index('refunds_invoice_idx').on(t.invoiceId),
  ],
);

// ─── Ticketing ───────────────────────────────────────────
export const tickets = mockSchema.table(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketNumber: text('ticket_number').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    status: ticketStatus('status').notNull().default('open'),
    priority: ticketPriority('priority').notNull().default('normal'),
    category: ticketCategory('category').notNull(),
    assignee: text('assignee'),
    relatedInvoiceNumber: text('related_invoice_number'),
    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('tickets_customer_idx').on(t.customerId),
    index('tickets_status_idx').on(t.status),
  ],
);

export const ticketComments = mockSchema.table(
  'ticket_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    author: text('author').notNull(),
    authorType: commentAuthorType('author_type').notNull(),
    body: text('body').notNull(),
    isInternal: boolean('is_internal').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('ticket_comments_ticket_idx').on(t.ticketId)],
);
