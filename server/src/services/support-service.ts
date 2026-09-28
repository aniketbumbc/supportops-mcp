import type {
  TicketingAdapter,
  TicketPatch,
} from '../adapters/ticketing/ticketing-adapter';
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
/** Allowed status changes. Reopening a closed ticket additionally needs a lead or admin. */
const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['pending', 'resolved'],
  pending: ['open', 'resolved'],
  resolved: ['open', 'closed'],
  closed: ['open'],
};

/** Leads and admins may mark tickets urgent and reopen closed ones. */
const isLeadOrAdmin = (ctx: RequestContext) =>
  hasRole(ctx, 'support_lead', 'admin');

export interface CreateTicketResult {
  ticket: TicketView;
  /** Set when the requested priority was lowered (urgent → high for non-leads). */
  priorityAdjusted: {
    requested: TicketPriority;
    applied: TicketPriority;
  } | null;
  /** True when an identical earlier request's result was returned. */
  replayed: boolean;
}

export interface UpdateTicketResult {
  ticket: TicketView;
  changesApplied: string[];
  replayed: boolean;
}
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

  /**
   * Opens a ticket. "urgent" is reserved for leads and admins: anyone else gets
   * "high" plus an internal note saying why, rather than a refused request.
   */
  async createTicket(
    ctx: RequestContext,
    input: {
      customerRef: string;
      subject: string;
      description: string;
      priority?: TicketPriority;
      category: TicketCategory;
      relatedInvoiceNumber?: string;
    },
  ): Promise<CreateTicketResult> {
    const customerRef = assertRef(
      'customer',
      input.customerRef,
      'customer_ref',
    );
    const relatedInvoiceNumber =
      input.relatedInvoiceNumber !== undefined
        ? assertRef(
            'invoice',
            input.relatedInvoiceNumber,
            'related_invoice_number',
          )
        : undefined;
    const subject = input.subject.trim();
    const description = input.description.trim();
    if (subject.length < 5 || subject.length > 150) {
      throw Errors.validation('subject must be 5 to 150 characters', {
        field: 'subject',
      });
    }
    if (description.length < 10 || description.length > 4000) {
      throw Errors.validation('description must be 10 to 4000 characters', {
        field: 'description',
      });
    }

    const requested = input.priority ?? 'normal';
    const applied: TicketPriority =
      requested === 'urgent' && !isLeadOrAdmin(ctx) ? 'high' : requested;
    const args = {
      customerRef,
      subject,
      description,
      priority: requested,
      category: input.category,
      relatedInvoiceNumber,
    };

    const { result, replayed } = await withIdempotency(
      ctx,
      'create_support_ticket',
      args,
      async () => {
        let ticket = await this.ticketing.createTicket(ctx, {
          ...args,
          priority: applied,
        });
        if (applied !== requested) {
          ticket = await this.ticketing.addComment(ctx, ticket.ticketNumber, {
            body: `Priority set to "${applied}" instead of "${requested}": only support leads and admins can mark tickets urgent.`,
            authorType: 'system',
            isInternal: true,
          });
        }
        return toView(ticket);
      },
    );

    return {
      ticket: result,
      priorityAdjusted: applied !== requested ? { requested, applied } : null,
      replayed,
    };
  }
  /**
   * Changes status / priority / assignee and/or adds an internal note.
   * Status changes must follow ALLOWED_TRANSITIONS; reopening a closed ticket
   * needs a lead or admin. Every change is recorded on the ticket.
   */
  async updateTicket(
    ctx: RequestContext,
    input: {
      ticketNumber: string;
      status?: TicketStatus;
      priority?: TicketPriority;
      /** A user id, or "unassigned". */
      assignee?: string;
      internalNote?: string;
    },
  ): Promise<UpdateTicketResult> {
    const ticketNumber = assertRef(
      'ticket',
      input.ticketNumber,
      'ticket_number',
    );
    const note = input.internalNote?.trim();
    const assignee = input.assignee?.trim();

    if (
      input.status === undefined &&
      input.priority === undefined &&
      assignee === undefined &&
      !note
    ) {
      throw Errors.validation(
        'Provide at least one of status, priority, assignee, internal_note',
      );
    }
    if (note !== undefined && (note.length < 1 || note.length > 2000)) {
      throw Errors.validation('internal_note must be 1 to 2000 characters', {
        field: 'internal_note',
      });
    }
    if (
      assignee !== undefined &&
      (assignee.length < 1 || assignee.length > 100)
    ) {
      throw Errors.validation('assignee must be a user id or "unassigned"', {
        field: 'assignee',
      });
    }

    const args = {
      ticketNumber,
      status: input.status,
      priority: input.priority,
      assignee,
      note,
    };

    const { result, replayed } = await withIdempotency(
      ctx,
      'update_ticket',
      args,
      async () => {
        const current = await this.ticketing.getTicket(ctx, ticketNumber);

        // Status rules
        if (input.status !== undefined && input.status !== current.status) {
          if (!ALLOWED_TRANSITIONS[current.status].includes(input.status)) {
            throw Errors.policyViolation(
              `A ${current.status} ticket can't be moved to ${input.status}. ` +
                `Allowed: ${ALLOWED_TRANSITIONS[current.status].join(', ')}.`,
              { from: current.status, to: input.status },
            );
          }
          if (current.status === 'closed' && !isLeadOrAdmin(ctx)) {
            throw Errors.policyViolation(
              'Only support leads or admins can reopen a closed ticket.',
            );
          }
        }

        const patch: TicketPatch = {};
        if (input.status !== undefined) patch.status = input.status;
        if (input.priority !== undefined) {
          patch.priority =
            input.priority === 'urgent' && !isLeadOrAdmin(ctx)
              ? 'high'
              : input.priority;
        }
        if (assignee !== undefined)
          patch.assignee =
            assignee.toLowerCase() === 'unassigned' ? null : assignee;

        const changes: string[] = [];
        let ticket = current;
        if (Object.keys(patch).length > 0) {
          const updated = await this.ticketing.updateTicket(
            ctx,
            ticketNumber,
            patch,
          );
          ticket = updated.ticket;
          changes.push(...updated.changesApplied);
        }
        if (input.priority === 'urgent' && patch.priority === 'high') {
          changes.push(
            'priority urgent requested → high applied (urgent is for leads and admins)',
          );
        }
        if (note) {
          ticket = await this.ticketing.addComment(ctx, ticketNumber, {
            body: note,
            authorType: 'agent',
            isInternal: true,
          });
          changes.push('internal note added');
        }
        return { ticket: toView(ticket), changesApplied: changes };
      },
    );

    return { ...result, replayed };
  }
}
