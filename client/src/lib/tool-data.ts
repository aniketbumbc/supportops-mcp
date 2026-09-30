/**
 * Shapes of each tool's structured result . The server
 * validates these with its outputSchema, so the UI can rely on them.
 */

export interface CustomerMatch {
  customer_ref: string;
  name: string;
  primary_email: string;
  tier: string;
  status: string;
  region: string;
}
export interface FindCustomerData {
  matches: CustomerMatch[];
  total_matches: number;
  has_more: boolean;
}

export interface AccountData {
  customer_ref: string;
  name: string;
  tier: string;
  status: string;
  region: string;
  customer_since: string;
  primary_contact: { name: string; email: string; role: string } | null;
  subscriptions:
    | {
        subscription_ref: string;
        plan: string;
        status: string;
        billing_cycle: string;
        amount_minor: number;
        currency: string;
        renews_at: string | null;
      }[]
    | null;
  balance: {
    open_invoices: number;
    amount_due_minor: number;
    currency: string;
  } | null;
  support: { open_tickets: number; last_ticket_at: string | null } | null;
  unavailable_sections: string[];
}

export interface InvoiceRow {
  invoice_number: string;
  status: string;
  description: string;
  issued_at: string;
  due_at: string;
  paid_at: string | null;
  amount_minor: number;
  amount_paid_minor: number;
  amount_refunded_minor: number;
  refundable_minor: number;
  refund_window_ends_at: string | null;
  currency: string;
  payment_count: number;
  flags: string[];
}
export interface InvoicesData {
  invoices: InvoiceRow[];
  next_cursor: string | null;
}

export interface TicketRow {
  ticket_number: string;
  customer_ref: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  assignee: string | null;
  related_invoice_number: string | null;
  created_at: string;
  updated_at: string;
  untrusted_customer_text: string;
  text_truncated: boolean;
}
export interface TicketsData {
  tickets: TicketRow[];
  next_cursor: string | null;
}

export interface CreatedTicketData {
  ticket_number: string;
  customer_ref: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  related_invoice_number: string | null;
  created_at: string;
  priority_adjusted: { requested: string; applied: string } | null;
  replayed: boolean;
}
export interface UpdatedTicketData {
  ticket_number: string;
  status: string;
  priority: string;
  assignee: string | null;
  updated_at: string;
  changes_applied: string[];
  replayed: boolean;
}

export interface CreatedCustomerData {
  status: 'created' | 'possible_duplicates_found';
  customer_ref: string | null;
  name: string | null;
  possible_duplicates: {
    customer_ref: string;
    name: string;
    primary_email: string;
    reason: string;
  }[];
  replayed: boolean;
}
export interface UpdatedCustomerData {
  customer_ref: string;
  changes_applied: string[];
  customer: {
    name: string;
    primary_email: string;
    phone: string | null;
    tier: string;
    status: string;
    region: string;
  };
  replayed: boolean;
}
