import { Chat } from '@/components/chat/chat';
import { requireUser } from '@/lib/session';

function suggestionsFor(roles: string[]): string[] {
  const canRefund = roles.some((r) => ['support_lead', 'finance', 'admin'].includes(r));
  const canTicket = roles.some((r) => ['support_agent', 'support_lead', 'admin'].includes(r));
  return [
    'Find Acme Traders and show their recent invoices',
    'Who is Orbit Retail?',
    canRefund
      ? 'Acme was charged twice this month. Refund the duplicate.'
      : 'Why was Kestrel Foods’ last invoice outside the refund window?',
    canTicket
      ? 'Pinewood Labs has a failed payment. Open a ticket for it.'
      : 'Show the open tickets for Quartz Media',
  ];
}

export default async function ChatPage({ searchParams }: PageProps<'/chat'>) {
  const user = await requireUser();
  const { denied } = await searchParams;
  return (
    <>
      {denied && (
        <p role="alert" className="mx-4 mt-4 rounded-md bg-amber-tint px-3 py-2.5 text-sm text-amber lg:mx-6">
          That page isn’t available for your role.
        </p>
      )}
      <Chat firstName={user.displayName.split(' ')[0]!} suggestions={suggestionsFor(user.roles)} />
    </>
  );
}