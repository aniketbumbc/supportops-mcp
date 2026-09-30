import { PageHeader } from '@/components/shell/page-header';
import { requireRole } from '@/lib/session';

/** Placeholder until Step 13. */
export default async function AuditPage() {
  await requireRole('admin');
  return <PageHeader title="Audit log" description="Every tool call, who made it and what happened." />;
}