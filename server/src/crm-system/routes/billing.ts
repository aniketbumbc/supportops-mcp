/**
 * Mock billing + payments API. Stands in for a system like Stripe, Razorpay or Chargebee.
 *   GET  /billing/v1/subscriptions?customer_ref=
 *   POST /billing/v1/subscriptions               (admin/mock: subscription + first invoice)
 *   GET  /billing/v1/invoices?customer_ref=&status=&from=&to=&limit=&offset=
 *   GET  /billing/v1/invoices/:invoiceNumber      (lines, payments, refunds)
 *   POST /billing/v1/refunds                      (requires Idempotency-Key header)
 *   GET  /billing/v1/refunds/:refundRef
 *
 * Like a real payment provider, this only enforces payment-level rules
 * (payment succeeded, amount not over-refunded). Business policy such as
 * role limits, refund windows and approvals belongs to the MCP server.
 */
import { randomBytes } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client';
import { formatInvoiceNumber, formatRef } from '../../db/refs';
import {
  billingCycle,
  customers,
  invoiceLines,
  invoices,
  invoiceStatus,
  paymentMethod,
  payments,
  refunds,
  subscriptions,
} from '../../db/schema/index';
import {
  ApiError,
  iso,
  notFound,
  paginate,
  paginationQuery,
  parse,
  pgErrorCode,
} from '../lib/helper';

type RefundRow = typeof refunds.$inferSelect;

/** A Drizzle transaction handle, so helpers can run inside the caller's transaction. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Next invoice number for the current year, e.g. INV-2026-0023 → INV-2026-0024.
 * Numbers restart every year, so a plain sequence doesn't fit. The advisory lock
 * makes concurrent requests wait their turn; it is released automatically when
 * the transaction commits or rolls back. Must be called inside a transaction.
 */
async function nextInvoiceNumber(tx: Tx): Promise<string> {
  const year = new Date().getUTCFullYear();
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('mock.invoice_number'))`,
  );
  const [{ max } = { max: 0 }] = await tx.execute<{ max: number }>(sql`
    select coalesce(max(substring(invoice_number from 10)::int), 0)::int as max
    from mock.invoices
    where invoice_number like ${`INV-${year}-%`}
  `);
  return formatInvoiceNumber(year, max + 1);
}

type SubscriptionRow = typeof subscriptions.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;

const toSubscription = (s: SubscriptionRow) => ({
  subscription_ref: s.subscriptionRef,
  plan_name: s.planName,
  status: s.status,
  billing_cycle: s.billingCycle,
  amount_minor: s.amountMinor,
  currency: s.currency,
  current_period_start: iso(s.currentPeriodStart),
  current_period_end: iso(s.currentPeriodEnd),
});

/** Subscription + its first invoice + that invoice's payment (if any), in one response. */
async function subscriptionResponse(subscriptionId: string) {
  const [row] = await db
    .select({ subscription: subscriptions, customerRef: customers.customerRef })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(eq(subscriptions.id, subscriptionId));
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.subscriptionId, subscriptionId))
    .orderBy(asc(invoices.issuedAt))
    .limit(1);
  const [payment] = invoice
    ? await db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, invoice.id))
        .orderBy(asc(payments.createdAt))
        .limit(1)
    : [];

  return {
    customer_ref: row!.customerRef,
    subscription: toSubscription(row!.subscription),
    invoice: invoice
      ? {
          invoice_number: invoice.invoiceNumber,
          status: invoice.status,
          description: invoice.description,
          amount_minor: invoice.amountMinor,
          currency: invoice.currency,
          issued_at: iso(invoice.issuedAt),
          due_at: iso(invoice.dueAt),
          paid_at: iso(invoice.paidAt),
        }
      : null,
    payment: payment
      ? {
          payment_ref: payment.paymentRef,
          amount_minor: payment.amountMinor,
          currency: payment.currency,
          method: payment.method,
          status: payment.status,
          paid_at: iso(payment.paidAt),
        }
      : null,
  };
}

async function customerIdOrThrow(customerRef: string): Promise<string> {
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerRef, customerRef));
  if (!row) throw notFound('Customer', customerRef);
  return row.id;
}

/**
 * Aggregates computed in SQL so every invoice row carries its money state.
 * The outer column is written fully qualified on purpose: Drizzle renders
 * invoices.id unqualified in single-table selects, which inside a
 * subquery would bind to the inner table's own "id".
 */
const outerInvoiceId = sql.raw('"mock"."invoices"."id"');
const amountPaid = sql<number>`coalesce((
  select sum(p.amount_minor) from mock.payments p
  where p.invoice_id = ${outerInvoiceId} and p.status = 'succeeded'), 0)::int`;
const amountRefunded = sql<number>`coalesce((
  select sum(r.amount_minor) from mock.refunds r
  where r.invoice_id = ${outerInvoiceId} and r.status in ('pending', 'succeeded')), 0)::int`;
const successfulPaymentCount = sql<number>`(
  select count(*) from mock.payments p
  where p.invoice_id = ${outerInvoiceId} and p.status = 'succeeded')::int`;
const lastPaymentAt = sql<Date | null>`(
  select max(p.paid_at) from mock.payments p
  where p.invoice_id = ${outerInvoiceId} and p.status = 'succeeded')`;

async function toRefundResponse(r: RefundRow) {
  const [refs] = await db
    .select({
      paymentRef: payments.paymentRef,
      invoiceNumber: invoices.invoiceNumber,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(eq(payments.id, r.paymentId));
  return {
    refund_ref: r.refundRef,
    payment_ref: refs?.paymentRef,
    invoice_number: refs?.invoiceNumber,
    amount_minor: r.amountMinor,
    currency: r.currency,
    reason: r.reason,
    status: r.status,
    metadata: r.metadata,
    created_at: iso(r.createdAt),
  };
}

export async function billingRoutes(app: FastifyInstance) {
  // ─── Subscriptions ────────────────────────────────────
  app.get('/billing/v1/subscriptions', async (request) => {
    const q = parse(z.object({ customer_ref: z.string() }), request.query);
    const customerId = await customerIdOrThrow(q.customer_ref);
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customerId))
      .orderBy(desc(subscriptions.createdAt));
    return { data: rows.map(toSubscription) };
  });

  // ─── Create subscription (+ first invoice, optionally paid) ───
  app.post('/billing/v1/subscriptions', async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'];
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 200
    ) {
      throw new ApiError(
        400,
        'missing_idempotency_key',
        'Idempotency-Key header is required (8–200 characters)',
      );
    }
    const body = parse(
      z
        .object({
          customer_ref: z.string(),
          plan_name: z.string().trim().min(2).max(100),
          billing_cycle: z.enum(billingCycle.enumValues),
          amount_minor: z.number().int().positive(),
          mark_paid: z.boolean().default(false),
          payment_method: z.enum(paymentMethod.enumValues).optional(),
          created_by: z.string().min(1),
        })
        .refine((v) => !v.mark_paid || v.payment_method !== undefined, {
          message: 'payment_method is required when mark_paid is true',
          path: ['payment_method'],
        }),
      request.body,
    );

    // Replay: same key returns the original result; same key + different body is rejected.
    const replay = async () => {
      const [existing] = await db
        .select({
          subscription: subscriptions,
          customerRef: customers.customerRef,
        })
        .from(subscriptions)
        .innerJoin(customers, eq(customers.id, subscriptions.customerId))
        .where(eq(subscriptions.idempotencyKey, idempotencyKey));
      if (!existing) return null;
      const s = existing.subscription;
      const sameRequest =
        existing.customerRef === body.customer_ref &&
        s.planName === body.plan_name &&
        s.billingCycle === body.billing_cycle &&
        s.amountMinor === body.amount_minor;
      if (!sameRequest) {
        throw new ApiError(
          409,
          'idempotency_key_reused',
          'This Idempotency-Key was already used with different parameters',
        );
      }
      reply.header('idempotent-replayed', 'true');
      return subscriptionResponse(s.id);
    };

    const replayed = await replay();
    if (replayed) return replayed;

    try {
      const subscriptionId = await db.transaction(async (tx) => {
        // Lock the customer row so two different requests can't both pass the
        // "no active subscription" check at the same time.
        const [customer] = await tx
          .select()
          .from(customers)
          .where(eq(customers.customerRef, body.customer_ref))
          .for('update');
        if (!customer) throw notFound('Customer', body.customer_ref);
        if (customer.status !== 'active') {
          throw new ApiError(
            422,
            'customer_not_active',
            `Customer ${body.customer_ref} is ${customer.status}; subscriptions need an active customer`,
          );
        }

        const [current] = await tx
          .select({ ref: subscriptions.subscriptionRef })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.customerId, customer.id),
              inArray(subscriptions.status, ['trialing', 'active', 'past_due']),
            ),
          );
        if (current) {
          throw new ApiError(
            409,
            'active_subscription_exists',
            `Customer ${body.customer_ref} already has subscription ${current.ref}`,
            { existing_subscription_ref: current.ref },
          );
        }

        const now = new Date();
        const periodDays = body.billing_cycle === 'annual' ? 365 : 30;

        // 1. Subscription
        const [{ subNo } = { subNo: 0 }] = await tx.execute<{ subNo: number }>(
          sql`select nextval('mock.subscription_ref_seq')::int as "subNo"`,
        );
        const [subscription] = await tx
          .insert(subscriptions)
          .values({
            subscriptionRef: formatRef('SUB', subNo),
            customerId: customer.id,
            planName: body.plan_name,
            status: 'active',
            billingCycle: body.billing_cycle,
            amountMinor: body.amount_minor,
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + periodDays * DAY_MS),
            idempotencyKey,
          })
          .returning({ id: subscriptions.id });

        // 2. First invoice (number taken under the advisory lock, inserted in this tx)
        const invoiceNumber = await nextInvoiceNumber(tx);
        const [invoice] = await tx
          .insert(invoices)
          .values({
            invoiceNumber,
            customerId: customer.id,
            subscriptionId: subscription!.id,
            status: body.mark_paid ? 'paid' : 'open',
            description:
              body.billing_cycle === 'annual'
                ? 'Annual subscription'
                : 'Monthly subscription',
            amountMinor: body.amount_minor,
            issuedAt: now,
            dueAt: new Date(now.getTime() + 15 * DAY_MS),
            paidAt: body.mark_paid ? now : null,
          })
          .returning({ id: invoices.id });
        await tx.insert(invoiceLines).values({
          invoiceId: invoice!.id,
          description: `${body.plan_name} (${body.billing_cycle})`,
          quantity: 1,
          unitAmountMinor: body.amount_minor,
          amountMinor: body.amount_minor,
        });

        // 3. Payment, only when marked paid
        if (body.mark_paid) {
          const [{ payNo } = { payNo: 0 }] = await tx.execute<{
            payNo: number;
          }>(sql`select nextval('mock.payment_ref_seq')::int as "payNo"`);
          await tx.insert(payments).values({
            paymentRef: formatRef('PAY', payNo),
            invoiceId: invoice!.id,
            customerId: customer.id,
            amountMinor: body.amount_minor,
            method: body.payment_method!,
            status: 'succeeded',
            providerRef: `pay_${randomBytes(7).toString('hex')}`,
            paidAt: now,
          });
        }

        return subscription!.id;
      });

      request.log.info(
        { customerRef: body.customer_ref, createdBy: body.created_by },
        'Subscription created',
      );
      reply.status(201);
      return subscriptionResponse(subscriptionId);
    } catch (error) {
      // Two requests with the same key raced: the loser replays the winner's result.
      if (pgErrorCode(error) === '23505') {
        const raced = await replay();
        if (raced) return raced;
      }
      throw error;
    }
  });

  // ─── Invoice list ─────────────────────────────────────
  app.get('/billing/v1/invoices', async (request) => {
    const q = parse(
      paginationQuery
        .extend({
          customer_ref: z.string(),
          status: z.enum(invoiceStatus.enumValues).optional(),
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
        })
        .refine((v) => !v.from || !v.to || v.from <= v.to, {
          message: '"from" must be before "to"',
          path: ['from'],
        }),
      request.query,
    );
    const customerId = await customerIdOrThrow(q.customer_ref);

    const conditions: SQL[] = [eq(invoices.customerId, customerId)];
    if (q.status) conditions.push(eq(invoices.status, q.status));
    if (q.from) conditions.push(gte(invoices.issuedAt, q.from));
    if (q.to) conditions.push(lte(invoices.issuedAt, q.to));

    const rows = await db
      .select({
        invoice: invoices,
        amountPaid,
        amountRefunded,
        successfulPaymentCount,
        lastPaymentAt,
      })
      .from(invoices)
      .where(and(...conditions))
      .orderBy(desc(invoices.issuedAt))
      .limit(q.limit + 1)
      .offset(q.offset);

    const page = paginate(rows, q.limit, q.offset);
    return {
      ...page,
      data: page.data.map((r) => ({
        invoice_number: r.invoice.invoiceNumber,
        customer_ref: q.customer_ref,
        status: r.invoice.status,
        description: r.invoice.description,
        amount_minor: r.invoice.amountMinor,
        amount_paid_minor: r.amountPaid,
        amount_refunded_minor: r.amountRefunded,
        successful_payment_count: r.successfulPaymentCount,
        currency: r.invoice.currency,
        issued_at: iso(r.invoice.issuedAt),
        due_at: iso(r.invoice.dueAt),
        paid_at: iso(r.invoice.paidAt),
        last_payment_at: r.lastPaymentAt
          ? new Date(r.lastPaymentAt).toISOString()
          : null,
      })),
    };
  });

  // ─── Invoice detail ───────────────────────────────────
  app.get('/billing/v1/invoices/:invoiceNumber', async (request) => {
    const { invoiceNumber } = parse(
      z.object({ invoiceNumber: z.string() }),
      request.params,
    );
    const [row] = await db
      .select({ invoice: invoices, customerRef: customers.customerRef })
      .from(invoices)
      .innerJoin(customers, eq(customers.id, invoices.customerId))
      .where(eq(invoices.invoiceNumber, invoiceNumber));
    if (!row) throw notFound('Invoice', invoiceNumber);
    const inv = row.invoice;

    const [lineRows, paymentRows, refundRows] = await Promise.all([
      db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)),
      db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, inv.id))
        .orderBy(asc(payments.createdAt)),
      db
        .select()
        .from(refunds)
        .where(eq(refunds.invoiceId, inv.id))
        .orderBy(asc(refunds.createdAt)),
    ]);

    const refundedByPayment = new Map<string, number>();
    for (const r of refundRows) {
      if (r.status === 'failed') continue;
      refundedByPayment.set(
        r.paymentId,
        (refundedByPayment.get(r.paymentId) ?? 0) + r.amountMinor,
      );
    }
    const paymentRefById = new Map(
      paymentRows.map((p) => [p.id, p.paymentRef]),
    );

    return {
      invoice_number: inv.invoiceNumber,
      customer_ref: row.customerRef,
      status: inv.status,
      description: inv.description,
      amount_minor: inv.amountMinor,
      currency: inv.currency,
      issued_at: iso(inv.issuedAt),
      due_at: iso(inv.dueAt),
      paid_at: iso(inv.paidAt),
      lines: lineRows.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit_amount_minor: l.unitAmountMinor,
        amount_minor: l.amountMinor,
      })),
      payments: paymentRows.map((p) => ({
        payment_ref: p.paymentRef,
        amount_minor: p.amountMinor,
        currency: p.currency,
        method: p.method,
        status: p.status,
        failure_reason: p.failureReason,
        provider_ref: p.providerRef,
        paid_at: iso(p.paidAt),
        amount_refunded_minor: refundedByPayment.get(p.id) ?? 0,
      })),
      refunds: refundRows.map((r) => ({
        refund_ref: r.refundRef,
        payment_ref: paymentRefById.get(r.paymentId),
        amount_minor: r.amountMinor,
        currency: r.currency,
        reason: r.reason,
        status: r.status,
        created_at: iso(r.createdAt),
      })),
    };
  });

  // ─── Create refund ────────────────────────────────────
  app.post('/billing/v1/refunds', async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'];
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 200
    ) {
      throw new ApiError(
        400,
        'missing_idempotency_key',
        'Idempotency-Key header is required (8–200 characters)',
      );
    }
    const body = parse(
      z.object({
        payment_ref: z.string(),
        amount_minor: z.number().int().positive(),
        reason: z.string().trim().min(3).max(500),
        metadata: z.record(z.string(), z.unknown()).default({}),
      }),
      request.body,
    );

    // Replay: same key returns the original refund; a different request with the key is rejected.
    const replay = async () => {
      const [existing] = await db
        .select()
        .from(refunds)
        .where(eq(refunds.idempotencyKey, idempotencyKey));
      if (!existing) return null;
      const response = await toRefundResponse(existing);
      if (
        response.payment_ref !== body.payment_ref ||
        existing.amountMinor !== body.amount_minor
      ) {
        throw new ApiError(
          409,
          'idempotency_key_reused',
          'This Idempotency-Key was already used with different parameters',
        );
      }
      reply.header('idempotent-replayed', 'true');
      return response;
    };

    const replayed = await replay();
    if (replayed) return replayed;

    try {
      const created = await db.transaction(async (tx) => {
        // Lock the payment row so concurrent refunds cannot over-refund it.
        const [payment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.paymentRef, body.payment_ref))
          .for('update');
        if (!payment) throw notFound('Payment', body.payment_ref);
        if (payment.status !== 'succeeded') {
          throw new ApiError(
            422,
            'payment_not_refundable',
            `Payment ${body.payment_ref} has status "${payment.status}" and cannot be refunded`,
          );
        }

        const [{ refunded } = { refunded: 0 }] = await tx
          .select({
            refunded: sql<number>`coalesce(sum(${refunds.amountMinor}), 0)::int`,
          })
          .from(refunds)
          .where(
            and(
              eq(refunds.paymentId, payment.id),
              inArray(refunds.status, ['pending', 'succeeded']),
            ),
          );
        const refundable = payment.amountMinor - refunded;
        if (body.amount_minor > refundable) {
          throw new ApiError(
            422,
            'amount_exceeds_refundable',
            `Requested ${body.amount_minor} exceeds refundable amount ${refundable} on ${body.payment_ref}`,
            { refundable_minor: refundable },
          );
        }

        const [{ next } = { next: 0 }] = await tx.execute<{ next: number }>(
          sql`select nextval('mock.refund_ref_seq')::int as next`,
        );
        const [refund] = await tx
          .insert(refunds)
          .values({
            refundRef: formatRef('RFD', next),
            paymentId: payment.id,
            invoiceId: payment.invoiceId,
            customerId: payment.customerId,
            amountMinor: body.amount_minor,
            currency: payment.currency,
            reason: body.reason,
            status: 'succeeded',
            idempotencyKey,
            metadata: body.metadata,
          })
          .returning();
        return refund!;
      });

      reply.status(201);
      return toRefundResponse(created);
    } catch (error) {
      // Two identical requests raced: the loser replays the winner's result.
      if (pgErrorCode(error) === '23505') {
        const raced = await replay();
        if (raced) return raced;
      }
      throw error;
    }
  });

  app.get('/billing/v1/refunds/:refundRef', async (request) => {
    const { refundRef } = parse(
      z.object({ refundRef: z.string() }),
      request.params,
    );
    const [refund] = await db
      .select()
      .from(refunds)
      .where(eq(refunds.refundRef, refundRef));
    if (!refund) throw notFound('Refund', refundRef);
    return toRefundResponse(refund);
  });
}
