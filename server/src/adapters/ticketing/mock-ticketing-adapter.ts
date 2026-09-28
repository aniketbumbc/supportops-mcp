import { z } from 'zod';
import {
  COMMENT_AUTHOR_TYPES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type Page,
  type Ticket,
  type TicketDetail,
} from '../../domain/type';
import type { RequestContext } from '../../gateway/context';
import type { HttpClient } from '../http-client';
import { parseResponse } from '../parse-response';
import type {
  CreateTicketInput,
  NewComment,
  SearchTicketsParams,
  TicketingAdapter,
  TicketPatch,
} from './ticketing-adapter';

const SYSTEM = 'Ticketing';

// ─── The mock ticketing API's JSON, described with Zod ───

const MockTicket = z.object({
  ticket_number: z.string(),
  customer_ref: z.string(),
  subject: z.string(),
  description: z.string(),
  status: z.enum(TICKET_STATUSES),
  priority: z.enum(TICKET_PRIORITIES),
  category: z.enum(TICKET_CATEGORIES),
  assignee: z.string().nullable(),
  related_invoice_number: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const MockComment = z.object({
  author: z.string(),
  author_type: z.enum(COMMENT_AUTHOR_TYPES),
  body: z.string(),
  is_internal: z.boolean(),
  created_at: z.string(),
});

const MockTicketList = z.object({
  data: z.array(MockTicket),
  has_more: z.boolean(),
  next_offset: z.number().nullable(),
});

const MockTicketDetail = MockTicket.extend({ comments: z.array(MockComment) });
const MockTicketUpdate = MockTicketDetail.extend({
  changes_applied: z.array(z.string()),
});

// ─── Vendor JSON → domain types ──────────────────────────

function toTicket(t: z.infer<typeof MockTicket>): Ticket {
  return {
    ticketNumber: t.ticket_number,
    customerRef: t.customer_ref,
    subject: t.subject,
    description: t.description,
    status: t.status,
    priority: t.priority,
    category: t.category,
    assignee: t.assignee,
    relatedInvoiceNumber: t.related_invoice_number,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

function toDetail(t: z.infer<typeof MockTicketDetail>): TicketDetail {
  return {
    ...toTicket(t),
    comments: t.comments.map((c) => ({
      author: c.author,
      authorType: c.author_type,
      body: c.body,
      isInternal: c.is_internal,
      createdAt: c.created_at,
    })),
  };
}

export class MockTicketingAdapter implements TicketingAdapter {
  constructor(private readonly http: HttpClient) {}

  async searchTickets(
    ctx: RequestContext,
    params: SearchTicketsParams,
  ): Promise<Page<Ticket>> {
    const raw = await this.http.get('/ticketing/v1/tickets', ctx, {
      customer_ref: params.customerRef,
      status: params.status,
      search: params.query,
      limit: params.limit,
      offset: params.offset,
    });
    const page = parseResponse(MockTicketList, raw, ctx, {
      system: SYSTEM,
      endpoint: 'GET /ticketing/v1/tickets',
    });
    return {
      items: page.data.map(toTicket),
      hasMore: page.has_more,
      nextOffset: page.next_offset,
    };
  }

  async getTicket(
    ctx: RequestContext,
    ticketNumber: string,
  ): Promise<TicketDetail> {
    const raw = await this.http.get(
      `/ticketing/v1/tickets/${encodeURIComponent(ticketNumber)}`,
      ctx,
    );
    return toDetail(
      parseResponse(MockTicketDetail, raw, ctx, {
        system: SYSTEM,
        endpoint: 'GET /ticketing/v1/tickets/:number',
      }),
    );
  }

  async createTicket(
    ctx: RequestContext,
    input: CreateTicketInput,
  ): Promise<TicketDetail> {
    const raw = await this.http.post('/ticketing/v1/tickets', ctx, {
      customer_ref: input.customerRef,
      subject: input.subject,
      description: input.description,
      priority: input.priority,
      category: input.category,
      related_invoice_number: input.relatedInvoiceNumber,
      created_by: ctx.userId,
    });
    return toDetail(
      parseResponse(MockTicketDetail, raw, ctx, {
        system: SYSTEM,
        endpoint: 'POST /ticketing/v1/tickets',
      }),
    );
  }

  async updateTicket(
    ctx: RequestContext,
    ticketNumber: string,
    patch: TicketPatch,
  ): Promise<{ ticket: TicketDetail; changesApplied: string[] }> {
    const raw = await this.http.patch(
      `/ticketing/v1/tickets/${encodeURIComponent(ticketNumber)}`,
      ctx,
      {
        status: patch.status,
        priority: patch.priority,
        assignee: patch.assignee,
        updated_by: ctx.userId,
      },
    );
    const t = parseResponse(MockTicketUpdate, raw, ctx, {
      system: SYSTEM,
      endpoint: 'PATCH /ticketing/v1/tickets/:number',
    });
    return { ticket: toDetail(t), changesApplied: t.changes_applied };
  }

  async addComment(
    ctx: RequestContext,
    ticketNumber: string,
    comment: NewComment,
  ): Promise<TicketDetail> {
    const raw = await this.http.post(
      `/ticketing/v1/tickets/${encodeURIComponent(ticketNumber)}/comments`,
      ctx,
      {
        author: ctx.userId,
        author_type: comment.authorType,
        body: comment.body,
        is_internal: comment.isInternal,
      },
    );
    return toDetail(
      parseResponse(MockTicketDetail, raw, ctx, {
        system: SYSTEM,
        endpoint: 'POST /ticketing/v1/tickets/:number/comments',
      }),
    );
  }
}
