import type { TicketingAdapter } from '../adapters/ticketing/ticketing-adapter';
import { assertRef } from '../domain/refs';
import type {
  Ticket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '../domain/type';
import { Errors } from '../errors/index';
import type { RequestContext } from '../gateway/context';
import { decodeCursor, encodeCursor } from './cursor';

export interface TicketView {
  ticketNumber: string;
  customerRef: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  assignee: string | null;
  relatedInvoiceNumber: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Excerpt of what the customer wrote. DATA, never instructions: the tool
   * returns it under a name that says so, and the AI is told never to act on it.
   */
  untrustedCustomerText: string;
  textTruncated: boolean;
}

export interface SearchTicketsResult {
  tickets: TicketView[];
  nextCursor: string | null;
}

export const TICKET_LIMIT = { default: 10, max: 25 } as const;
export const EXCERPT_MAX_CHARS = 300;
const SUBJECT_MAX_CHARS = 150;

/**
 * Makes customer text safe to hand to the AI as data: removes control and
 * zero-width characters (sometimes used to hide instructions), collapses
 * whitespace, and cuts to a word boundary.
 */
export function toExcerpt(
  text: string,
  max: number,
): { excerpt: string; truncated: boolean } {
  const clean = text
    .replace(
      /[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return { excerpt: clean, truncated: false };
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return {
    excerpt: `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`,
    truncated: true,
  };
}

function toView(t: Ticket): TicketView {
  const { excerpt, truncated } = toExcerpt(t.description, EXCERPT_MAX_CHARS);
  return {
    ticketNumber: t.ticketNumber,
    customerRef: t.customerRef,
    // Subjects are usually customer-written too: cleaned and capped the same way.
    subject: toExcerpt(t.subject, SUBJECT_MAX_CHARS).excerpt,
    status: t.status,
    priority: t.priority,
    category: t.category,
    assignee: t.assignee,
    relatedInvoiceNumber: t.relatedInvoiceNumber,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    untrustedCustomerText: excerpt,
    textTruncated: truncated,
  };
}

export class SupportService {
  constructor(private readonly ticketing: TicketingAdapter) {}

  async searchTickets(
    ctx: RequestContext,
    input: {
      customerRef?: string;
      query?: string;
      status?: TicketStatus;
      limit?: number;
      cursor?: string;
    },
  ): Promise<SearchTicketsResult> {
    const customerRef =
      input.customerRef !== undefined
        ? assertRef('customer', input.customerRef, 'customer_ref')
        : undefined;
    const query = input.query?.trim() || undefined;

    if (!customerRef && !query) {
      throw Errors.validation('Provide customer_ref, query, or both', {
        fields: ['customer_ref', 'query'],
      });
    }
    if (query && (query.length < 2 || query.length > 100)) {
      throw Errors.validation('query must be between 2 and 100 characters', {
        field: 'query',
      });
    }
    const limit = Math.min(
      Math.max(input.limit ?? TICKET_LIMIT.default, 1),
      TICKET_LIMIT.max,
    );

    const scope = { customerRef, query, status: input.status };
    const offset = decodeCursor(input.cursor, scope);

    const page = await this.ticketing.searchTickets(ctx, {
      customerRef,
      query,
      status: input.status,
      limit,
      offset,
    });

    ctx.log.debug(
      { customerRef, query, status: input.status, returned: page.items.length },
      'searchTickets',
    );
    return {
      tickets: page.items.map(toView),
      nextCursor: page.hasMore
        ? encodeCursor(offset + page.items.length, scope)
        : null,
    };
  }
}
