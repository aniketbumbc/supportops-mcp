import { z } from 'zod';
import {
  BILLING_CYCLES,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  SUBSCRIPTION_STATUSES,
  type InvoiceDetail,
  type InvoiceSummary,
  type Page,
  type Subscription,
} from '../../domain/type';
import type { RequestContext } from '../../gateway/context';
import type { HttpClient } from '../http-client';
import { parseResponse } from '../parse-response';
import type { BillingAdapter, ListInvoicesParams } from './billing-adapter';

const SYSTEM = 'Billing';

// ─── The mock billing API's JSON, described with Zod ─────

const MockSubscription = z.object({
  subscription_ref: z.string(),
  plan_name: z.string(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  billing_cycle: z.enum(BILLING_CYCLES),
  amount_minor: z.number().int(),
  currency: z.string(),
  current_period_start: z.string(),
  current_period_end: z.string(),
});

const MockInvoiceBase = z.object({
  invoice_number: z.string(),
  customer_ref: z.string(),
  status: z.enum(INVOICE_STATUSES),
  description: z.string(),
  amount_minor: z.number().int(),
  currency: z.string(),
  issued_at: z.string(),
  due_at: z.string(),
  paid_at: z.string().nullable(),
});

const MockInvoiceSummary = MockInvoiceBase.extend({
  amount_paid_minor: z.number().int(),
  amount_refunded_minor: z.number().int(),
  successful_payment_count: z.number().int(),
  last_payment_at: z.string().nullable(),
});

const MockInvoiceDetail = MockInvoiceBase.extend({
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().int(),
      unit_amount_minor: z.number().int(),
      amount_minor: z.number().int(),
    }),
  ),
  payments: z.array(
    z.object({
      payment_ref: z.string(),
      amount_minor: z.number().int(),
      currency: z.string(),
      method: z.enum(PAYMENT_METHODS),
      status: z.enum(PAYMENT_STATUSES),
      failure_reason: z.string().nullable(),
      paid_at: z.string().nullable(),
      amount_refunded_minor: z.number().int(),
    }),
  ),
  refunds: z.array(
    z.object({
      refund_ref: z.string(),
      payment_ref: z.string(),
      amount_minor: z.number().int(),
      currency: z.string(),
      reason: z.string(),
      status: z.enum(REFUND_STATUSES),
      created_at: z.string(),
    }),
  ),
});

const MockSubscriptionList = z.object({ data: z.array(MockSubscription) });
const MockInvoiceList = z.object({
  data: z.array(MockInvoiceSummary),
  has_more: z.boolean(),
  next_offset: z.number().nullable(),
});

// ─── Vendor JSON → domain types ──────────────────────────

const toInvoiceBase = (i: z.infer<typeof MockInvoiceBase>) => ({
  invoiceNumber: i.invoice_number,
  customerRef: i.customer_ref,
  status: i.status,
  description: i.description,
  amountMinor: i.amount_minor,
  currency: i.currency,
  issuedAt: i.issued_at,
  dueAt: i.due_at,
  paidAt: i.paid_at,
});

export class MockBillingAdapter implements BillingAdapter {
  constructor(private readonly http: HttpClient) {}

  async listSubscriptions(
    ctx: RequestContext,
    customerRef: string,
  ): Promise<Subscription[]> {
    const raw = await this.http.get('/billing/v1/subscriptions', ctx, {
      customer_ref: customerRef,
    });
    const list = parseResponse(MockSubscriptionList, raw, ctx, {
      system: SYSTEM,
      endpoint: 'GET /billing/v1/subscriptions',
    });
    return list.data.map((s) => ({
      subscriptionRef: s.subscription_ref,
      planName: s.plan_name,
      status: s.status,
      billingCycle: s.billing_cycle,
      amountMinor: s.amount_minor,
      currency: s.currency,
      currentPeriodStart: s.current_period_start,
      currentPeriodEnd: s.current_period_end,
    }));
  }

  async listInvoices(
    ctx: RequestContext,
    params: ListInvoicesParams,
  ): Promise<Page<InvoiceSummary>> {
    const raw = await this.http.get('/billing/v1/invoices', ctx, {
      customer_ref: params.customerRef,
      status: params.status,
      from: params.from,
      to: params.to,
      limit: params.limit,
      offset: params.offset,
    });
    const page = parseResponse(MockInvoiceList, raw, ctx, {
      system: SYSTEM,
      endpoint: 'GET /billing/v1/invoices',
    });
    return {
      items: page.data.map((i) => ({
        ...toInvoiceBase(i),
        amountPaidMinor: i.amount_paid_minor,
        amountRefundedMinor: i.amount_refunded_minor,
        successfulPaymentCount: i.successful_payment_count,
        lastPaymentAt: i.last_payment_at,
      })),
      hasMore: page.has_more,
      nextOffset: page.next_offset,
    };
  }

  async getInvoice(
    ctx: RequestContext,
    invoiceNumber: string,
  ): Promise<InvoiceDetail> {
    const raw = await this.http.get(
      `/billing/v1/invoices/${encodeURIComponent(invoiceNumber)}`,
      ctx,
    );
    const i = parseResponse(MockInvoiceDetail, raw, ctx, {
      system: SYSTEM,
      endpoint: 'GET /billing/v1/invoices/:number',
    });
    return {
      ...toInvoiceBase(i),
      lines: i.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitAmountMinor: l.unit_amount_minor,
        amountMinor: l.amount_minor,
      })),
      payments: i.payments.map((p) => ({
        paymentRef: p.payment_ref,
        amountMinor: p.amount_minor,
        currency: p.currency,
        method: p.method,
        status: p.status,
        failureReason: p.failure_reason,
        paidAt: p.paid_at,
        amountRefundedMinor: p.amount_refunded_minor,
      })),
      refunds: i.refunds.map((r) => ({
        refundRef: r.refund_ref,
        paymentRef: r.payment_ref,
        amountMinor: r.amount_minor,
        currency: r.currency,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
      })),
    };
  }
}
