import { PageHeader } from '@/components/shell/page-header';
import { requireRole } from '@/lib/session';

/** Placeholder until Step 11. Server-side role check, not just a hidden menu item. */
export default async function ApprovalsPage() {
  await requireRole('support_lead', 'finance', 'admin');
  return <PageHeader title="Approvals" description="Refunds waiting for a second person." />;
}