/**
 * Mock ticketing API. Stands in for a system like Zendesk, Freshdesk or Jira Service Management.
 *   GET   /ticketing/v1/tickets?customer_ref=&status=&search=&limit=&offset=
 *   GET   /ticketing/v1/tickets/:ticketNumber            (includes comments)
 *   POST  /ticketing/v1/tickets
 *   PATCH /ticketing/v1/tickets/:ticketNumber
 *   POST  /ticketing/v1/tickets/:ticketNumber/comments
 *
 * Status-transition rules and role checks live in the MCP server, not here.
 */
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/client';
import { formatRef } from '../../db/refs';
import {
  commentAuthorType,
  customers,
  invoices,
  ticketCategory,
  ticketComments,
  ticketPriority,
  tickets,
  ticketStatus,
} from '../../db/schema/index';
import {
  ApiError,
  iso,
  likePattern,
  notFound,
  paginate,
  paginationQuery,
  parse,
} from '../lib/helper';

type TicketRow = typeof tickets.$inferSelect;
type CommentRow = typeof ticketComments.$inferSelect;

const toTicket = (t: TicketRow, customerRef: string) => ({
  ticket_number: t.ticketNumber,
  customer_ref: customerRef,
  subject: t.subject,
  description: t.description,
  status: t.status,
  priority: t.priority,
  category: t.category,
  assignee: t.assignee,
  related_invoice_number: t.relatedInvoiceNumber,
  created_at: iso(t.createdAt),
  updated_at: iso(t.updatedAt),
});

const toComment = (c: CommentRow) => ({
  author: c.author,
  author_type: c.authorType,
  body: c.body,
  is_internal: c.isInternal,
  created_at: iso(c.createdAt),
});

async function findTicket(ticketNumber: string) {
  const [row] = await db
    .select({ ticket: tickets, customerRef: customers.customerRef })
    .from(tickets)
    .innerJoin(customers, eq(customers.id, tickets.customerId))
    .where(eq(tickets.ticketNumber, ticketNumber));
  if (!row) throw notFound('Ticket', ticketNumber);
  return row;
}

async function ticketWithComments(ticketNumber: string) {
  const { ticket, customerRef } = await findTicket(ticketNumber);
  const comments = await db
    .select()
    .from(ticketComments)
    .where(eq(ticketComments.ticketId, ticket.id))
    .orderBy(asc(ticketComments.createdAt));
  return {
    ...toTicket(ticket, customerRef),
    comments: comments.map(toComment),
  };
}

export async function ticketingRoutes(app: FastifyInstance) {
  // ─── List / search ────────────────────────────────────
  app.get('/ticketing/v1/tickets', async (request: FastifyRequest) => {
    const q = parse(
      paginationQuery.extend({
        customer_ref: z.string().optional(),
        status: z.enum(ticketStatus.enumValues).optional(),
        search: z.string().trim().min(2).max(100).optional(),
      }),
      request.query,
    );

    const conditions: SQL[] = [];
    if (q.customer_ref)
      conditions.push(eq(customers.customerRef, q.customer_ref));
    if (q.status) conditions.push(eq(tickets.status, q.status));
    if (q.search) {
      conditions.push(
        or(
          ilike(tickets.subject, likePattern(q.search)),
          ilike(tickets.description, likePattern(q.search)),
        )!,
      );
    }

    const rows = await db
      .select({ ticket: tickets, customerRef: customers.customerRef })
      .from(tickets)
      .innerJoin(customers, eq(customers.id, tickets.customerId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(tickets.updatedAt))
      .limit(q.limit + 1)
      .offset(q.offset);

    const page = paginate(rows, q.limit, q.offset);
    return {
      ...page,
      data: page.data.map((r) => toTicket(r.ticket, r.customerRef)),
    };
  });

  // ─── Detail ───────────────────────────────────────────
  app.get(
    '/ticketing/v1/tickets/:ticketNumber',
    async (request: FastifyRequest) => {
      const { ticketNumber } = parse(
        z.object({ ticketNumber: z.string() }),
        request.params,
      );
      return ticketWithComments(ticketNumber);
    },
  );

  // ─── Create ───────────────────────────────────────────
  app.post(
    '/ticketing/v1/tickets',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = parse(
        z.object({
          customer_ref: z.string(),
          subject: z.string().trim().min(5).max(150),
          description: z.string().trim().min(10).max(4000),
          priority: z.enum(ticketPriority.enumValues).default('normal'),
          category: z.enum(ticketCategory.enumValues),
          related_invoice_number: z.string().optional(),
          created_by: z.string().min(1),
        }),
        request.body,
      );

      const [customer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerRef, body.customer_ref));
      if (!customer) throw notFound('Customer', body.customer_ref);

      if (body.related_invoice_number) {
        const [inv] = await db
          .select({ customerId: invoices.customerId })
          .from(invoices)
          .where(eq(invoices.invoiceNumber, body.related_invoice_number));
        if (!inv || inv.customerId !== customer.id) {
          throw new ApiError(
            422,
            'invalid_related_invoice',
            `Invoice ${body.related_invoice_number} does not belong to ${body.customer_ref}`,
          );
        }
      }

      const ticketNumber = await db.transaction(async (tx) => {
        const [{ next } = { next: 0 }] = await tx.execute<{ next: number }>(
          sql`select nextval('mock.ticket_number_seq')::int as next`,
        );
        const number = formatRef('TCK', next);
        const [created] = await tx
          .insert(tickets)
          .values({
            ticketNumber: number,
            customerId: customer.id,
            subject: body.subject,
            description: body.description,
            priority: body.priority,
            category: body.category,
            relatedInvoiceNumber: body.related_invoice_number ?? null,
          })
          .returning({ id: tickets.id });
        await tx.insert(ticketComments).values({
          ticketId: created!.id,
          author: 'system',
          authorType: 'system',
          body: `Ticket created by ${body.created_by}`,
          isInternal: true,
        });
        return number;
      });

      reply.status(201);
      return ticketWithComments(ticketNumber);
    },
  );

  // ─── Update ───────────────────────────────────────────
  app.patch(
    '/ticketing/v1/tickets/:ticketNumber',
    async (request: FastifyRequest) => {
      const { ticketNumber } = parse(
        z.object({ ticketNumber: z.string() }),
        request.params,
      );
      const body = parse(
        z
          .object({
            status: z.enum(ticketStatus.enumValues).optional(),
            priority: z.enum(ticketPriority.enumValues).optional(),
            assignee: z.string().min(1).nullable().optional(),
            updated_by: z.string().min(1),
          })
          .refine(
            (v) =>
              v.status !== undefined ||
              v.priority !== undefined ||
              v.assignee !== undefined,
            { message: 'Provide at least one of status, priority, assignee' },
          ),
        request.body,
      );

      const { ticket } = await findTicket(ticketNumber);
      const changes: string[] = [];
      const set: Partial<typeof tickets.$inferInsert> = {};
      if (body.status !== undefined && body.status !== ticket.status) {
        set.status = body.status;
        changes.push(`status ${ticket.status} → ${body.status}`);
      }
      if (body.priority !== undefined && body.priority !== ticket.priority) {
        set.priority = body.priority;
        changes.push(`priority ${ticket.priority} → ${body.priority}`);
      }
      if (body.assignee !== undefined && body.assignee !== ticket.assignee) {
        set.assignee = body.assignee;
        changes.push(
          `assignee ${ticket.assignee ?? 'unassigned'} → ${body.assignee ?? 'unassigned'}`,
        );
      }

      if (changes.length > 0) {
        await db.transaction(async (tx) => {
          await tx
            .update(tickets)
            .set({ ...set, updatedAt: new Date() })
            .where(eq(tickets.id, ticket.id));
          await tx.insert(ticketComments).values({
            ticketId: ticket.id,
            author: 'system',
            authorType: 'system',
            body: `${body.updated_by} changed ${changes.join(', ')}`,
            isInternal: true,
          });
        });
      }

      return {
        ...(await ticketWithComments(ticketNumber)),
        changes_applied: changes,
      };
    },
  );

  // ─── Add comment ──────────────────────────────────────
  app.post(
    '/ticketing/v1/tickets/:ticketNumber/comments',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { ticketNumber } = parse(
        z.object({ ticketNumber: z.string() }),
        request.params,
      );
      const body = parse(
        z.object({
          author: z.string().min(1),
          author_type: z.enum(commentAuthorType.enumValues).default('agent'),
          body: z.string().trim().min(1).max(2000),
          is_internal: z.boolean().default(true),
        }),
        request.body,
      );

      const { ticket } = await findTicket(ticketNumber);
      await db.transaction(async (tx) => {
        await tx.insert(ticketComments).values({
          ticketId: ticket.id,
          author: body.author,
          authorType: body.author_type,
          body: body.body,
          isInternal: body.is_internal,
        });
        await tx
          .update(tickets)
          .set({ updatedAt: new Date() })
          .where(eq(tickets.id, ticket.id));
      });

      reply.status(201);
      return ticketWithComments(ticketNumber);
    },
  );
}
