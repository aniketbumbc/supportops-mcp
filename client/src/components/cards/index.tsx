import type * as T from '@/lib/tool-data';
import { AccountCard } from './account-card';
import { CustomerMatchesCard } from './customer-matches';
import { InvoicesCard } from './invoices-card';
import { CreatedCustomerCard, CreatedTicketCard, UpdatedCustomerCard, UpdatedTicketCard } from './record-results';
import { TicketsCard } from './tickets-card';

/**
 * The card for a successful tool result, or null if that tool has no card
 * (it then shows as a status line). issue_refund gets its card in Step 10.
 */
export function ToolResultCard({
  toolName,
  data,
  input,
}: {
  toolName: string;
  data: Record<string, unknown>;
  input: Record<string, unknown>;
}) {
  switch (toolName) {
    case 'find_customer':
      return <CustomerMatchesCard data={data as unknown as T.FindCustomerData} />;
    case 'get_customer_account':
      return <AccountCard data={data as unknown as T.AccountData} />;
    case 'get_customer_invoices':
      return (
        <InvoicesCard
          data={data as unknown as T.InvoicesData}
          customerRef={String(input.customer_ref ?? '').toUpperCase()}
        />
      );
    case 'search_customer_tickets':
      return <TicketsCard data={data as unknown as T.TicketsData} />;
    case 'create_support_ticket':
      return <CreatedTicketCard data={data as unknown as T.CreatedTicketData} />;
    case 'update_ticket':
      return <UpdatedTicketCard data={data as unknown as T.UpdatedTicketData} />;
    case 'create_customer':
      return <CreatedCustomerCard data={data as unknown as T.CreatedCustomerData} />;
    case 'update_customer':
      return <UpdatedCustomerCard data={data as unknown as T.UpdatedCustomerData} />;
    default:
      return null;
  }
}