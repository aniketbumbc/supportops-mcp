import type { CrmAdapter } from '../adapters/crm/crm-adapter';
import type { BillingAdapter } from '../adapters/billing/billing-adapter';
import type { TicketingAdapter } from '../adapters/ticketing/ticketing-adapter';
import type { Customer, CustomerDetail } from '../domain/type';
import { assertRef } from '../domain/refs';
import { Errors, AppError } from '../errors/index';
import { hasRole, type RequestContext } from '../gateway/context';

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
] as const;

export const BILLING_CYCLES = ['monthly', 'annual'] as const;

/** A search hit, shaped for the AI: just enough to pick the right customer. */
export interface CustomerMatch {
  customerRef: string;
  name: string;
  primaryEmail: string;
  tier: Customer['tier'];
  status: Customer['status'];
  region: string;
}

export interface FindCustomersResult {
  matches: CustomerMatch[];
  totalMatches: number;
  /** True when more customers matched than were returned. */
  hasMore: boolean;
}

export const FIND_LIMIT = { default: 5, max: 10 } as const;
export type AccountSection = 'subscriptions' | 'balance' | 'support';
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export interface AccountOverview {
  customerRef: string;
  name: string;
  tier: Customer['tier'];
  status: Customer['status'];
  region: string;
  customerSince: string;
  primaryContact: { name: string; email: string; role: string } | null;
  subscriptions:
    | {
        subscriptionRef: string;
        planName: string;
        status: SubscriptionStatus;
        billingCycle: BillingCycle;
        amountMinor: number;
        currency: string;
        /** Null when the subscription is cancelled. */
        renewsAt: string | null;
      }[]
    | null;
  balance: {
    openInvoices: number;
    amountDueMinor: number;
    currency: string;
  } | null;
  support: { openTickets: number; lastTicketActivityAt: string | null } | null;
  /** Sections left empty because their system was unreachable. */
  unavailableSections: AccountSection[];
}

/** Enough to count open invoices / tickets for one customer. */
const COUNT_LIMIT = 50;

/** "riya@acme.example" → "r***@acme.example". Keeps the domain so agents can still recognise it. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Roles that may see full contact details. Everyone else (support_agent) sees masked emails. */
const canSeeFullContactDetails = (ctx: RequestContext) =>
  hasRole(ctx, 'support_lead', 'finance', 'admin');

/**
 * Best match first: exact reference, then exact name, then names starting with
 * the query, then everything else. Helps the AI pick correctly and show the
 * likeliest customer at the top.
 */
function relevance(customer: Customer, query: string): number {
  const q = query.toLowerCase();
  const name = customer.name.toLowerCase();
  if (customer.customerRef.toLowerCase() === q) return 0;
  if (name === q) return 1;
  if (name.startsWith(q)) return 2;
  return 3;
}

/**
 * Business logic for customers. Knows nothing about MCP or HTTP:
 * it takes a RequestContext and plain values, and returns plain objects.
 */
export class CustomerService {
  constructor(
    private readonly crm: CrmAdapter,
    private readonly billing: BillingAdapter,
    private readonly ticketing: TicketingAdapter,
  ) {}

  async findCustomers(
    ctx: RequestContext,
    input: { query: string; limit?: number },
  ): Promise<FindCustomersResult> {
    const query = input.query.trim();
    if (query.length < 2 || query.length > 100) {
      throw Errors.validation(
        'Search query must be between 2 and 100 characters',
        {
          field: 'query',
        },
      );
    }
    const limit = Math.min(
      Math.max(input.limit ?? FIND_LIMIT.default, 1),
      FIND_LIMIT.max,
    );

    const page = await this.crm.searchCustomers(ctx, { query, limit });
    const showFullEmail = canSeeFullContactDetails(ctx);

    const matches = [...page.items]
      .sort((a, b) => relevance(a, query) - relevance(b, query))
      .map((c) => ({
        customerRef: c.customerRef,
        name: c.name,
        primaryEmail: showFullEmail
          ? c.primaryEmail
          : maskEmail(c.primaryEmail),
        tier: c.tier,
        status: c.status,
        region: c.region,
      }));

    ctx.log.debug(
      { query, returned: matches.length, masked: !showFullEmail },
      'findCustomers',
    );
    return { matches, totalMatches: matches.length, hasMore: page.hasMore };
  }

  /**
   * One-screen account overview, built from CRM + billing + ticketing in parallel.
   * The CRM profile is required. If billing or ticketing is down, the overview is
   * still returned with that section set to null and listed in unavailableSections,
   * so the AI can help with what it has instead of failing completely.
   */
  async getAccount(
    ctx: RequestContext,
    input: { customerRef: string },
  ): Promise<AccountOverview> {
    const customerRef = assertRef(
      'customer',
      input.customerRef,
      'customer_ref',
    );

    const [customer, subscriptions, openInvoices, openTickets, latestTicket] =
      await Promise.allSettled([
        this.crm.getCustomer(ctx, customerRef),
        this.billing.listSubscriptions(ctx, customerRef),
        this.billing.listInvoices(ctx, {
          customerRef,
          status: 'open',
          limit: COUNT_LIMIT,
        }),
        this.ticketing.searchTickets(ctx, {
          customerRef,
          status: 'open',
          limit: COUNT_LIMIT,
        }),
        this.ticketing.searchTickets(ctx, { customerRef, limit: 1 }),
      ]);

    // The CRM profile is essential: NOT_FOUND, outages etc. propagate as-is.
    if (customer.status === 'rejected') throw customer.reason;
    const profile: CustomerDetail = customer.value;

    const unavailable = new Set<AccountSection>();
    /** Unwraps a settled call; an upstream outage marks the section unavailable. */
    const optional = <T>(
      result: PromiseSettledResult<T>,
      section: AccountSection,
    ): T | null => {
      if (result.status === 'fulfilled') return result.value;
      if (
        result.reason instanceof AppError &&
        result.reason.code === 'UPSTREAM_UNAVAILABLE'
      ) {
        unavailable.add(section);
        return null;
      }
      throw result.reason;
    };

    const subs = optional(subscriptions, 'subscriptions');
    const invoices = optional(openInvoices, 'balance');
    const tickets = optional(openTickets, 'support');
    const latest = optional(latestTicket, 'support');

    const contact =
      profile.contacts.find((c) => c.isPrimary) ?? profile.contacts[0] ?? null;
    const showFullEmail = canSeeFullContactDetails(ctx);

    return {
      customerRef: profile.customerRef,
      name: profile.name,
      tier: profile.tier,
      status: profile.status,
      region: profile.region,
      customerSince: profile.customerSince,
      primaryContact: contact
        ? {
            name: contact.name,
            email: showFullEmail ? contact.email : maskEmail(contact.email),
            role: contact.role,
          }
        : null,
      subscriptions: subs
        ? subs.map((s) => ({
            subscriptionRef: s.subscriptionRef,
            planName: s.planName,
            status: s.status,
            billingCycle: s.billingCycle,
            amountMinor: s.amountMinor,
            currency: s.currency,
            renewsAt: s.status === 'cancelled' ? null : s.currentPeriodEnd,
          }))
        : null,
      balance: invoices
        ? {
            openInvoices: invoices.items.length,
            amountDueMinor: invoices.items.reduce(
              (sum, i) => sum + Math.max(i.amountMinor - i.amountPaidMinor, 0),
              0,
            ),
            currency:
              invoices.items[0]?.currency ?? subs?.[0]?.currency ?? 'INR',
          }
        : null,
      support:
        tickets && latest
          ? {
              openTickets: tickets.items.length,
              lastTicketActivityAt: latest.items[0]?.updatedAt ?? null,
            }
          : null,
      unavailableSections: [...unavailable],
    };
  }
}
