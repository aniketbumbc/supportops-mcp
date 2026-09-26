import type {
  Page,
  Ticket,
  TicketDetail,
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

/**
 * What the rest of the system needs from a ticketing / helpdesk system.
 * The mock today; Zendesk, Freshdesk or Jira Service Management later.
 * Create/update methods are added in Phase 6 with the write tools.
 */
export interface TicketingAdapter {
  /** Most recently updated first. */
  searchTickets(
    ctx: RequestContext,
    params: SearchTicketsParams,
  ): Promise<Page<Ticket>>;

  /** Ticket with its comment thread. Throws NOT_FOUND if it does not exist. */
  getTicket(ctx: RequestContext, ticketNumber: string): Promise<TicketDetail>;
}
