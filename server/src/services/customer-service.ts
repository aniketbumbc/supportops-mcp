import type { CrmAdapter, CustomerPatch } from '../adapters/crm/crm-adapter';
import type { BillingAdapter } from '../adapters/billing/billing-adapter';
import type { TicketingAdapter } from '../adapters/ticketing/ticketing-adapter';
import type {
  BillingCycle,
  Customer,
  CustomerDetail,
  CustomerStatus,
  CustomerTier,
  SubscriptionStatus,
} from '../domain/type';
import { assertRef } from '../domain/refs';
import { Errors, AppError } from '../errors/index';
import { hasRole, type RequestContext } from '../gateway/context';
import { peekIdempotent, withIdempotency } from '../gateway/idempotency';

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
] as const;

export const BILLING_CYCLES = ['monthly', 'annual'] as const;
// ─── Customer writes: helpers ────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Free email providers: a shared domain there says nothing about being the same company. */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me',
  'rediffmail.com',
]);

/** Words that don't distinguish companies: "Acme Traders Pvt Ltd" ≈ "Acme Traders". */
const NAME_NOISE = new Set([
  'the',
  'pvt',
  'private',
  'ltd',
  'limited',
  'llp',
  'inc',
  'co',
  'company',
  'corp',
  'corporation',
  'and',
]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NAME_NOISE.has(t));
}

const emailDomain = (email: string) => email.split('@')[1]?.toLowerCase() ?? '';

/** Why an existing customer might be the same as the new one, or null if it isn't. */
function duplicateReason(
  candidate: Customer,
  newName: string,
  newEmail: string,
): string | null {
  const a = nameTokens(newName).join(' ');
  const b = nameTokens(candidate.name).join(' ');
  if (a && a === b) return 'same name';
  if (a && b && (a.startsWith(`${b} `) || b.startsWith(`${a} `)))
    return 'similar name';
  const domain = emailDomain(newEmail);
  if (
    domain &&
    !FREE_EMAIL_DOMAINS.has(domain) &&
    emailDomain(candidate.primaryEmail) === domain
  ) {
    return 'same email domain';
  }
  return null;
}

/** Field rules shared by create and update. */
function checkLength(
  value: string,
  field: string,
  min: number,
  max: number,
): string {
  const v = value.trim();
  if (v.length < min || v.length > max) {
    throw Errors.validation(`${field} must be ${min} to ${max} characters`, {
      field,
    });
  }
  return v;
}

function checkEmail(value: string, field: string): string {
  const v = value.trim().toLowerCase();
  if (!EMAIL.test(v) || v.length > 254) {
    throw Errors.validation(`${field} must be a valid email address`, {
      field,
    });
  }
  return v;
}

/** Fields a support_agent may change. Tier and status need a lead or admin. */
const AGENT_EDITABLE = new Set(['name', 'primaryEmail', 'phone', 'region']);

export interface PossibleDuplicate {
  customerRef: string;
  name: string;
  primaryEmail: string;
  reason: string;
}

export type CreateCustomerResult =
  | { status: 'created'; customer: CustomerDetail; replayed: boolean }
  | {
      status: 'possible_duplicates_found';
      possibleDuplicates: PossibleDuplicate[];
    };

export interface UpdateCustomerResult {
  customer: CustomerDetail;
  changesApplied: string[];
  replayed: boolean;
}

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
  /**
   * Creates a customer after a duplicate check. Similar existing customers are
   * returned instead of creating, unless the user has confirmed it's a new one
   * (confirmNotDuplicate). The same email as an existing customer is always refused.
   */
  async createCustomer(
    ctx: RequestContext,
    input: {
      name: string;
      primaryEmail: string;
      phone?: string;
      tier?: CustomerTier;
      region: string;
      contactName: string;
      contactEmail: string;
      contactRole: string;
      confirmNotDuplicate?: boolean;
    },
  ): Promise<CreateCustomerResult> {
    const name = checkLength(input.name, 'name', 2, 150);
    const primaryEmail = checkEmail(input.primaryEmail, 'primary_email');
    const phone =
      input.phone !== undefined
        ? checkLength(input.phone, 'phone', 6, 30)
        : undefined;
    const region = checkLength(input.region, 'region', 2, 50);
    const contact = {
      name: checkLength(input.contactName, 'contact_name', 2, 100),
      email: checkEmail(input.contactEmail, 'contact_email'),
      role: checkLength(input.contactRole, 'contact_role', 2, 100),
    };
    const tier = input.tier ?? 'standard';
    const args = { name, primaryEmail, phone, tier, region, contact };

    // A retry of a create that already succeeded: return it. (Otherwise the duplicate
    // check below would find the customer the first attempt created.)
    const earlier = await peekIdempotent<CustomerDetail>(
      ctx,
      'create_customer',
      args,
    );
    if (earlier)
      return { status: 'created', customer: earlier, replayed: true };

    // Duplicate check: search by the distinctive part of the name and by email domain.
    if (!input.confirmNotDuplicate) {
      const queries = new Set<string>();
      const tokens = nameTokens(name);
      if (tokens[0] && tokens[0].length >= 2)
        queries.add(tokens.slice(0, 2).join(' '));
      const domain = emailDomain(primaryEmail);
      if (domain && !FREE_EMAIL_DOMAINS.has(domain)) queries.add(domain);

      const pages = await Promise.all(
        [...queries].map((query) =>
          this.crm.searchCustomers(ctx, { query, limit: 10 }),
        ),
      );
      const seen = new Map<string, PossibleDuplicate>();
      const showFullEmail = canSeeFullContactDetails(ctx);
      for (const candidate of pages.flatMap((p) => p.items)) {
        if (candidate.primaryEmail.toLowerCase() === primaryEmail) {
          throw Errors.conflict(
            `A customer with this email already exists: ${candidate.customerRef}.`,
            { existing_customer_ref: candidate.customerRef },
          );
        }
        const reason = duplicateReason(candidate, name, primaryEmail);
        if (reason && !seen.has(candidate.customerRef)) {
          seen.set(candidate.customerRef, {
            customerRef: candidate.customerRef,
            name: candidate.name,
            primaryEmail: showFullEmail
              ? candidate.primaryEmail
              : maskEmail(candidate.primaryEmail),
            reason,
          });
        }
      }
      if (seen.size > 0) {
        return {
          status: 'possible_duplicates_found',
          possibleDuplicates: [...seen.values()],
        };
      }
    }

    const { result, replayed } = await withIdempotency(
      ctx,
      'create_customer',
      args,
      () =>
        this.crm.createCustomer(ctx, {
          name,
          primaryEmail,
          phone,
          tier,
          region,
          primaryContact: contact,
        }),
    );
    return { status: 'created', customer: result, replayed };
  }

  /**
   * Updates a customer. support_agent may change contact fields only (name, email,
   * phone, region); tier and status need a lead or admin. A status change needs a
   * reason, which is kept in the audit trail with the call's arguments.
   */
  async updateCustomer(
    ctx: RequestContext,
    input: {
      customerRef: string;
      name?: string;
      primaryEmail?: string;
      phone?: string | null;
      region?: string;
      tier?: CustomerTier;
      status?: CustomerStatus;
      reason?: string;
    },
  ): Promise<UpdateCustomerResult> {
    const customerRef = assertRef(
      'customer',
      input.customerRef,
      'customer_ref',
    );

    const patch: CustomerPatch = {};
    if (input.name !== undefined)
      patch.name = checkLength(input.name, 'name', 2, 150);
    if (input.primaryEmail !== undefined) {
      patch.primaryEmail = checkEmail(input.primaryEmail, 'primary_email');
    }
    if (input.phone !== undefined) {
      patch.phone =
        input.phone === null ? null : checkLength(input.phone, 'phone', 6, 30);
    }
    if (input.region !== undefined)
      patch.region = checkLength(input.region, 'region', 2, 50);
    if (input.tier !== undefined) patch.tier = input.tier;
    if (input.status !== undefined) patch.status = input.status;

    const fields = Object.keys(patch);
    if (fields.length === 0) {
      throw Errors.validation('Provide at least one field to change');
    }

    // Field-level permission: agents may only edit contact details.
    const restricted = fields.filter((f) => !AGENT_EDITABLE.has(f));
    if (restricted.length > 0 && !hasRole(ctx, 'support_lead', 'admin')) {
      throw Errors.permissionDenied(
        `Only support leads or admins can change ${restricted.join(' and ')}. ` +
          'You can change name, primary_email, phone and region.',
      );
    }

    let reason: string | undefined;
    if (patch.status !== undefined) {
      if (!input.reason) {
        throw Errors.validation('reason is required when changing status', {
          field: 'reason',
        });
      }
      reason = checkLength(input.reason, 'reason', 10, 500);
    }

    const { result, replayed } = await withIdempotency(
      ctx,
      'update_customer',
      { customerRef, patch, reason },
      () => this.crm.updateCustomer(ctx, customerRef, patch),
    );

    const showFullEmail = canSeeFullContactDetails(ctx);
    const customer = showFullEmail
      ? result.customer
      : {
          ...result.customer,
          primaryEmail: maskEmail(result.customer.primaryEmail),
          contacts: result.customer.contacts.map((c) => ({
            ...c,
            email: maskEmail(c.email),
          })),
        };
    ctx.log.info(
      { customerRef, changes: result.changesApplied, reason },
      'Customer updated',
    );
    return { customer, changesApplied: result.changesApplied, replayed };
  }
}
