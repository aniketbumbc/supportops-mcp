import { MobileNav } from '@/components/shell/mobile-nav';
import { NavLinks } from '@/components/shell/nav-links';
import { UserBlock } from '@/components/shell/user-block';
import { listApprovals } from '@/lib/api';
import { navItemsFor } from '@/lib/nav';
import { getSessionToken, requireUser } from '@/lib/session';

/** Shared shell for every logged-in page: role-aware sidebar, user block, mobile drawer. */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requireUser();
  const items = navItemsFor(user.roles);

  // Pending-approval badge for approvers. A failure here must never break the page.
  let pendingApprovals: number | null = null;
  if (items.some((i) => i.href === '/approvals')) {
    const token = await getSessionToken();
    pendingApprovals = token
      ? await listApprovals(token, 'pending')
          .then((a) => a.filter((x) => x.canDecide).length)
          .catch(() => null)
      : null;
  }

  const sidebar = (
    <nav aria-label="Main" className="flex flex-1 flex-col justify-between px-3 pb-4">
      <NavLinks items={items} pendingApprovals={pendingApprovals} />
      <UserBlock user={user} />
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <MobileNav>{sidebar}</MobileNav>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-rule bg-paper lg:sticky lg:top-0 lg:flex lg:h-screen">
        <p className="px-6 pt-6 pb-8 text-lg font-semibold tracking-tight">SupportOps</p>
        {sidebar}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-white">{children}</main>
    </div>
  );
}