import { PageHeader } from '@/components/shell/page-header';
import { withUserMcp } from '@/lib/mcp';
import { requireUser } from '@/lib/session';

/** Placeholder until Step 8: proves the MCP client works with the user's session. */
export default async function ChatPage({ searchParams }: PageProps<'/chat'>) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const tools = await withUserMcp((mcp) => mcp.listTools());

  return (
    <>
      <PageHeader title="Chat" description="Ask about customers, invoices, tickets and refunds." />
      {denied && (
        <p role="alert" className="mx-6 mt-5 rounded-md bg-amber-tint px-3 py-2.5 text-sm text-amber lg:mx-10">
          That page isn’t available for your role.
        </p>
      )}
      <div className="px-6 py-8 lg:px-10">
        <p className="text-ink-soft">
          Hi {user.displayName.split(' ')[0]}, the assistant arrives in Step 8. Tools available to you:
        </p>
        <ul className="mt-4 space-y-1.5 text-sm">
          {tools.map((t) => (
            <li key={t.name} className="flex items-center gap-2">
              <span className="font-medium">{t.title ?? t.name}</span>
              {t.annotations?.destructiveHint && (
                <span className="rounded bg-amber-tint px-1.5 py-0.5 text-xs text-amber">changes money</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}