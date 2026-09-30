'use client';

import { ClipboardCheck, KeyRound, MessageSquare, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/nav';

const ICONS = { chat: MessageSquare, approvals: ClipboardCheck, tokens: KeyRound, audit: ScrollText };

interface Props {
  items: NavItem[];
  /** Pending approvals to show as a badge (only for approvers). */
  pendingApprovals: number | null;
}

export function NavLinks({ items, pendingApprovals }: Props) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-[15px] transition-colors focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none ${
                active ? 'bg-ledger-tint font-medium text-ledger' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1">{item.label}</span>
              {item.href === '/approvals' && pendingApprovals ? (
                <span
                  className="rounded-full bg-amber px-2 py-0.5 text-xs font-medium text-white"
                  aria-label={`${pendingApprovals} pending`}
                >
                  {pendingApprovals}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}