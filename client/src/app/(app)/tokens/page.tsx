
import { PageHeader } from '@/components/shell/page-header';
import { requireUser } from '@/lib/session';

/** Placeholder until Step 12. */
export default async function TokensPage() {
  await requireUser();
  return <PageHeader title="Access tokens" description="Connect Cursor, Claude and other MCP clients." />;
}