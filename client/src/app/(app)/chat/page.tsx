import { Chat, type Suggestion } from '@/components/chat/chat';
import { requireUser } from '@/lib/session';

/**
 * Guided first questions, grouped so a new user sees the main flows in order.
 * Each one maps to a seeded test scenario; the hint says what to watch for.
 */
function suggestionsFor(roles: string[]): Suggestion[] {
  const canRefund = roles.some((r) => ['support_lead', 'finance', 'admin'].includes(r));
  const canApproveLotus = roles.some((r) => ['finance', 'admin'].includes(r));

  const lookup: Suggestion[] = [
    {
      group: 'lookup',
      icon: 'search',
      prompt: 'Find Acme Traders and show their recent invoices',
      hint: 'Customer and invoice cards, read live from the CRM and billing.',
    },
    {
      group: 'lookup',
      icon: 'user',
      prompt: 'Who is Orbit Retail?',
      hint: 'Two customers match, so the assistant asks instead of guessing.',
    },
  ];

  const refunds: Suggestion[] = canRefund
    ? [
        {
          group: 'refunds',
          icon: 'refund',
          prompt: 'Acme was charged twice this month. Refund the duplicate.',
          hint: 'A refund slip appears. No money moves until you confirm.',
        },
        {
          group: 'refunds',
          icon: 'blocked',
          prompt: 'Refund Kestrel Foods’ oldest paid invoice',
          hint: 'Refused: it is outside the refund window.',
        },
        {
          group: 'refunds',
          icon: 'approval',
          prompt: 'Refund Lotus Textiles’ annual invoice in full',
          hint: canApproveLotus
            ? 'Too large to refund directly, so it waits in Approvals for a second person.'
            : 'Above your role’s refund limit, so it is refused.',
        },
      ]
    : [
        {
          group: 'refunds',
          icon: 'blocked',
          prompt: 'Why was Kestrel Foods’ last invoice outside the refund window?',
          hint: 'Refund rules are explained. Your role can’t issue refunds.',
        },
        {
          group: 'refunds',
          icon: 'user',
          prompt: 'Is Vega Motors’ account active?',
          hint: 'The account is suspended, which limits what can be done.',
        },
        {
          group: 'refunds',
          icon: 'refund',
          prompt: 'Refund Acme Traders’ duplicate charge',
          hint: 'Denied: refunds need a support lead, finance or admin.',
        },
      ];

  const tickets: Suggestion[] = [
    {
      group: 'tickets',
      icon: 'ticket',
      prompt: 'Show open tickets for Quartz Media',
      hint: 'One ticket hides instructions aimed at the AI. Watch it ignore them.',
    },
  ];

  return [...lookup, ...refunds, ...tickets];
}

export const metadata = { title: 'Chat' };

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
      <Chat firstName={user.displayName.split(' ')[0]!} suggestions={suggestionsFor(user.roles)}canRefund={user.roles.some((r) => ['support_lead', 'finance', 'admin'].includes(r))}
      />
    </>
  );
}