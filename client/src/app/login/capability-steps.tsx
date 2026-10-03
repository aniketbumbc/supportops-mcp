'use client';

import type { CSSProperties } from 'react';
import { ReceiptText, ShieldCheck, Ticket, UserRound } from 'lucide-react';
import { useAutoStep } from '@/lib/hooks/use-auto-step';

/**
 * What the assistant can do, one step per group of MCP tools. Steps light up in
 * turn, each in its own colour, with a dot travelling down to the next one.
 * The brand panel is dark in both themes, so the colours are fixed.
 */
const STEPS = [
  {
    Icon: UserRound,
    title: 'Find, create and update customers',
    tools: 'find_customer · get_customer_account · create_customer · update_customer',
    color: '#34d399',
  },
  {
    Icon: ReceiptText,
    title: 'Check invoices and payments',
    tools: 'get_customer_invoices',
    color: '#38bdf8',
  },
  {
    Icon: Ticket,
    title: 'Search, open and update tickets',
    tools: 'search_customer_tickets · create_support_ticket · update_ticket',
    color: '#fbbf24',
  },
  {
    Icon: ShieldCheck,
    title: 'Issue refunds, confirmed by a person',
    tools: 'issue_refund · approvals',
    color: '#a78bfa',
  },
];

export function CapabilitySteps() {
  const [active, pick] = useAutoStep(STEPS.length, 2200);

  return (
    <ol className="mt-6 max-w-sm">
      {STEPS.map(({ Icon, title, tools, color }, i) => {
        const lit = i <= active;
        const next = STEPS[i + 1];
        return (
          <li
            key={title}
            style={{ '--c': color, '--n': next?.color ?? color } as CSSProperties}
            className="relative flex gap-4 pb-4 last:pb-0"
          >
            {/* Connector to the next step */}
            {next && (
              <span aria-hidden className="absolute top-11 bottom-1 left-5 w-0.5 -translate-x-1/2 overflow-visible">
                <span className="absolute inset-0 rounded-full bg-brand-fg/15" />
                <span
                  className={`absolute inset-0 origin-top rounded-full bg-linear-to-b from-(--c) to-(--n) transition-transform duration-700 ${
                    i < active ? 'scale-y-100' : 'scale-y-0'
                  }`}
                />
                {i === active - 1 && (
                  <span
                    key={active}
                    className="absolute left-1/2 size-2 -translate-x-1/2 rounded-full bg-(--n) shadow-[0_0_10px_var(--n)] motion-safe:animate-travel-down"
                  />
                )}
              </span>
            )}

            <button
              type="button"
              onClick={() => pick(i)}
              aria-label={`Step ${i + 1}: ${title}`}
              aria-current={i === active ? 'step' : undefined}
              className={`relative flex size-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-500 focus-visible:ring-2 focus-visible:ring-brand-fg/50 focus-visible:outline-none ${
                lit
                  ? 'border-(--c) bg-(--c)/15 text-(--c)'
                  : 'border-brand-fg/15 bg-brand-fg/5 text-brand-fg/40'
              } ${i === active ? 'scale-110 shadow-[0_0_24px_-4px_var(--c)]' : ''}`}
            >
              <Icon aria-hidden className="size-4.5" />
              {i === active && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-xl ring-2 ring-(--c) opacity-40 motion-safe:animate-ping"
                />
              )}
            </button>

            <div className="pt-1">
              <p
                className={`text-[15px] leading-snug font-medium transition-colors duration-500 ${
                  lit ? 'text-brand-fg' : 'text-brand-fg/45'
                }`}
              >
                {title}
              </p>
              <p
                className={`mt-1 font-mono text-[11px] leading-relaxed transition-colors duration-500 [@media(max-height:860px)]:hidden ${
                  i === active ? 'text-(--c)' : 'text-brand-fg/35'
                }`}
              >
                {tools}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
