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
    <div className="flex items-center gap-3 border-t border-rule px-3 pt-4">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-medium text-paper"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.displayName}</p>
        <p className="truncate text-xs text-ink-soft">
          {user.roles.map((r) => ROLE_LABELS[r]).join(', ')}
        </p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Log out"
          title="Log out"
          className="rounded-md p-2 text-ink-soft hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
        >
          <LogOut size={18} />
        </button>
      </form>
    </div>
  );
}