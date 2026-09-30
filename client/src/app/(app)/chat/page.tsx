import { PageHeader } from '@/components/shell/page-header';
import { requireUser } from '@/lib/session';

/** Placeholder until Step 8 builds the chat. */
export default async function ChatPage({ searchParams }: PageProps<'/chat'>) {
  const user = await requireUser();
  const { denied } = await searchParams;
  return (
    <>
      <PageHeader title="Chat" description="Ask about customers, invoices, tickets and refunds." />
      {denied && (
        <p role="alert" className="mx-6 mt-5 rounded-md bg-amber-tint px-3 py-2.5 text-sm text-amber lg:mx-10">
          That page isn’t available for your role.
        </p>
      )}
      <div className="px-6 py-8 text-ink-soft lg:px-10">
        Hi {user.displayName.split(' ')[0]}, the assistant arrives in Step 8.
      </div>
    </>
  );
}