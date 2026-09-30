/** How each tool is described while it runs and after it finishes. */
export const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  find_customer: { running: 'Searching customers', done: 'Searched customers' },
  get_customer_account: {
    running: 'Loading the account',
    done: 'Loaded the account',
  },
  get_customer_invoices: {
    running: 'Checking invoices',
    done: 'Checked invoices',
  },
  search_customer_tickets: {
    running: 'Searching tickets',
    done: 'Searched tickets',
  },
  create_support_ticket: {
    running: 'Creating a ticket',
    done: 'Ticket request finished',
  },
  update_ticket: {
    running: 'Updating the ticket',
    done: 'Ticket update finished',
  },
  create_customer: {
    running: 'Creating the customer',
    done: 'Customer request finished',
  },
  update_customer: {
    running: 'Updating the customer',
    done: 'Customer update finished',
  },
  issue_refund: {
    running: 'Preparing a refund preview',
    done: 'Refund preview ready',
  },
};

export const toolLabel = (name: string, state: 'running' | 'done') =>
  TOOL_LABELS[name]?.[state] ??
  (state === 'running' ? `Running ${name}` : `Finished ${name}`);
