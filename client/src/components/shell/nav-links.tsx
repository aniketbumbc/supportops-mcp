"use client";

import {
  ClipboardCheck,
  KeyRound,
  MessageSquare,
  ScrollText,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";

const ICONS = {
  chat: MessageSquare,
  approvals: ClipboardCheck,
  tokens: KeyRound,
  audit: ScrollText,
};

interface Props {
  items: NavItem[];
  /** Pending approvals to show as a badge (only for approvers). */
  pendingApprovals: number | null;
}

export function NavLinks({ items, pendingApprovals }: Props) {
  const pathname = usePathname();
  return (
    <div>
      <p className="px-3 pb-2 text-[11px] font-medium tracking-wider text-ink-soft/70 uppercase">
        Menu
      </p>
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none ${
                  active
                    ? "bg-ledger-tint font-medium text-ledger"
                    : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-1/2 -left-3 h-5 w-1 -translate-y-1/2 rounded-r-full bg-ledger"
                  />
                )}
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                    active
                      ? "bg-ledger text-white shadow-sm"
                      : "bg-ink/[0.04] group-hover:bg-ink/[0.07]"
                  }`}
                >
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span className="flex-1">{item.label}</span>
                {item.href === "/approvals" && pendingApprovals ? (
                  <span
                    className="min-w-6 rounded-full bg-amber px-2 py-0.5 text-center text-xs font-semibold text-white shadow-sm"
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
    </div>
  );
}
