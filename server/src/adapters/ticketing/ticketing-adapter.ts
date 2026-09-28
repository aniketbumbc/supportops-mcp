import type {
  CommentAuthorType,
  Page,
  Ticket,
  TicketCategory,
  TicketDetail,
  TicketPriority,
  TicketStatus,
} from '../../domain/type';
import type { RequestContext } from '../../gateway/context';

export interface SearchTicketsParams {
  customerRef?: string;
  status?: TicketStatus;
  /** Matched against subject and description. */
  query?: string;
  limit: number;
  offset?: number;
}

export interface CreateTicketInput {
  customerRef: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  category: TicketCategory;
  relatedInvoiceNumber?: string;
}

/** Only the fields given are changed. assignee: null unassigns. */
export interface TicketPatch {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignee?: string | null;
}

export interface NewComment {
  body: string;
  authorType: CommentAuthorType;
  isInternal: boolean;
}

/**
 * What the rest of the system needs from a ticketing / helpdesk system.
 * The mock today; Zendesk, Freshdesk or Jira Service Management later.
 */
export interface TicketingAdapter {
  /** Most recently updated first. */
  searchTickets(
    ctx: RequestContext,
    params: SearchTicketsParams,
  ): Promise<Page<Ticket>>;

  /** Ticket with its comment thread. Throws NOT_FOUND if it does not exist. */
  getTicket(ctx: RequestContext, ticketNumber: string): Promise<TicketDetail>;

  /** Throws NOT_FOUND (customer) or CONFLICT (invoice belongs to someone else). */
  createTicket(
    ctx: RequestContext,
    input: CreateTicketInput,
  ): Promise<TicketDetail>;

  /** The ticketing system records each change as a system comment. */
  updateTicket(
    ctx: RequestContext,
    ticketNumber: string,
    patch: TicketPatch,
  ): Promise<{ ticket: TicketDetail; changesApplied: string[] }>;

  addComment(
    ctx: RequestContext,
    ticketNumber: string,
    comment: NewComment,
  ): Promise<TicketDetail>;
}
