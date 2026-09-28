import { z } from 'zod';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../domain/type';
import type { ToolName } from '../policy/tool-names.js';
import { defineTool } from './define-tool.js';

export const UPDATE_TICKET = 'update_ticket' satisfies ToolName;

export const updateTicketTool = defineTool({
  name: UPDATE_TICKET,
  title: 'Update ticket',
  description: [
    "Change a ticket's status, priority or assignee, and/or add an internal note",
    '(not visible to the customer). Give at least one of them.',
    'Status moves: open → pending or resolved; pending → open or resolved;',
    'resolved → open or closed; closed → open (support leads and admins only).',
    'Every change is recorded on the ticket. Repeating the same call changes nothing twice.',
  ].join(' '),
  inputSchema: {
    ticket_number: z.string().describe('Ticket reference, e.g. TCK-1007.'),
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assignee: z.string().optional().describe('A user id, or "unassigned".'),
    internal_note: z
      .string()
      .optional()
      .describe('1 to 2000 characters, for the support team.'),
  },
  outputSchema: {
    ticket_number: z.string(),
    status: z.enum(TICKET_STATUSES),
    priority: z.enum(TICKET_PRIORITIES),
    assignee: z.string().nullable(),
    updated_at: z.string(),
    changes_applied: z.array(z.string()),
    replayed: z.boolean(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },

  handler: async (args, { services, ctx }) => {
    const r = await services.support.updateTicket(ctx, {
      ticketNumber: args.ticket_number,
      status: args.status,
      priority: args.priority,
      assignee: args.assignee,
      internalNote: args.internal_note,
    });
    const t = r.ticket;
    return {
      structured: {
        ticket_number: t.ticketNumber,
        status: t.status,
        priority: t.priority,
        assignee: t.assignee,
        updated_at: t.updatedAt,
        changes_applied: r.changesApplied,
        replayed: r.replayed,
      },
      summary:
        r.changesApplied.length > 0
          ? `${t.ticketNumber}: ${r.changesApplied.join('; ')}.`
          : `${t.ticketNumber}: nothing changed.`,
      audit: { ticket_number: t.ticketNumber, changes: r.changesApplied },
    };
  },
});
