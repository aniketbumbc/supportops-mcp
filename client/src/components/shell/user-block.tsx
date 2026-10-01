import { LogOut } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import type { CurrentUser } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/nav';

export function UserBlock({ user }: { user: CurrentUser }) {
  const initials = user.displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-rule bg-surface p-2.5 shadow-[0_1px_2px_rgba(27,42,58,0.04)]">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ledger-tint text-sm font-semibold text-ledger ring-2 ring-ledger/20"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.displayName}</p>
        <p className="truncate text-xs text-ledger">
          {user.roles.map((r) => ROLE_LABELS[r]).join(', ')}
        </p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Log out"
          title="Log out"
          className="rounded-lg p-2 text-ink-soft transition hover:bg-danger-tint hover:text-danger focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
        >
          <LogOut size={18} />
        </button>
      </form>
    </div>
  );
}