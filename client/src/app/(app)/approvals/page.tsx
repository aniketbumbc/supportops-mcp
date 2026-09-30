import Link from 'next/link';
import { ApprovalsList } from '@/components/approvals/approvals-list';
import { PageHeader } from '@/components/shell/page-header';
import { listApprovals, type ApprovalStatus } from '@/lib/api';
import { getSessionToken, requireRole } from '@/lib/session';

const TABS: { value: ApprovalStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'executed', label: 'Refunded' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All' },
];

export const metadata = { title: 'Approvals' };

export default async function ApprovalsPage({ searchParams }: PageProps<'/approvals'>) {
  const user = await requireRole('support_lead', 'finance', 'admin');
  const { status: raw } = await searchParams;
  const status = (TABS.some((t) => t.value === raw) ? raw : 'pending') as ApprovalStatus | 'all';
  const approvals = await listApprovals((await getSessionToken())!, status);
  const empty = status === 'pending' ? 'Nothing waiting for a decision.' : 'No requests here.';

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Refunds that need a second person. Approving executes the refund immediately."
      />
      <div className="px-6 py-6 lg:px-10">
        <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={t.value === 'pending' ? '/approvals' : `/approvals?status=${t.value}`}
              aria-current={t.value === status ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${
                t.value === status ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <ApprovalsList approvals={approvals} currentUserId={user.id} emptyText={empty} />
      </div>
    </>
  );
}