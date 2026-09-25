import type { CrmAdapter } from '../adapters/crm/crm-adapter';
import type { Customer } from '../domain/type';
import { Errors } from '../errors/index';
import { hasRole, type RequestContext } from '../gateway/context';

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
  constructor(private readonly crm: CrmAdapter) {}

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
}
