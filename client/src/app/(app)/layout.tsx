import { Brand } from '@/components/shell/brand';
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
    <nav aria-label="Main" className="flex flex-1 flex-col justify-between px-3 pb-3">
      <NavLinks items={items} pendingApprovals={pendingApprovals} />
      <div>
        <UserBlock user={user} />
        <p className="mt-3 text-center text-xs text-ink-soft">
          Developed by{' '}
          <a
            href="https://www.aniketbdev.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ledger hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
          >
            Aniket B
          </a>
        </p>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-sm text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <MobileNav>{sidebar}</MobileNav>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-rule bg-paper lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="px-5 pt-6 pb-8">
          <Brand />
        </div>
        {sidebar}
      </aside>

      <main id="main" className="flex min-w-0 flex-1 flex-col bg-surface">{children}</main>
    </div>
  );
}