'use client';

import { Fragment, type CSSProperties } from 'react';
import { ReceiptText, ShieldCheck, Ticket, UserRound } from 'lucide-react';
import { useAutoStep } from '@/lib/hooks/use-auto-step';

/**
 * What the assistant can do, one station per group of MCP tools. A "train" runs
 * along the rail from station to station; each station lights up in its own colour
 * and the box below shows its details. The brand panel is dark in both themes, so
 * the colours are fixed.
 */
const STEPS = [
  {
    Icon: UserRound,
    label: 'Customers',
    title: 'Find, create and update customers',
    tools: 'find_customer · get_customer_account · create_customer · update_customer',
    color: '#34d399',
  },
  {
    Icon: ReceiptText,
    label: 'Invoices',
    title: 'Check invoices and payments',
    tools: 'get_customer_invoices',
    color: '#38bdf8',
  },
  {
    Icon: Ticket,
    label: 'Tickets',
    title: 'Search, open and update tickets',
    tools: 'search_customer_tickets · create_support_ticket · update_ticket',
    color: '#fbbf24',
  },
  {
    Icon: ShieldCheck,
    label: 'Refunds',
    title: 'Issue refunds, confirmed by a person',
    tools: 'issue_refund · approvals',
    color: '#a78bfa',
  },
];

export function CapabilitySteps() {
  const [active, pick] = useAutoStep(STEPS.length, 2200);
  const step = STEPS[active]!;

  return (
    <div className="mt-8 max-w-sm">
      <ol className="flex items-start">
        {STEPS.map(({ Icon, label, title, color }, i) => {
          const lit = i <= active;
          const next = STEPS[i + 1];
          return (
            <Fragment key={label}>
              <li style={{ '--c': color } as CSSProperties} className="flex w-14 shrink-0 flex-col items-center">
                <button
                  type="button"
                  onClick={() => pick(i)}
                  aria-label={`Step ${i + 1}: ${title}`}
                  aria-current={i === active ? 'step' : undefined}
                  className={`relative flex size-11 items-center justify-center rounded-xl border transition-all duration-500 focus-visible:ring-2 focus-visible:ring-brand-fg/50 focus-visible:outline-none ${
                    lit
                      ? 'border-(--c) bg-(--c)/15 text-(--c)'
                      : 'border-brand-fg/15 bg-brand-fg/5 text-brand-fg/40'
                  } ${i === active ? 'scale-110 shadow-[0_0_24px_-4px_var(--c)]' : ''}`}
                >
                  <Icon aria-hidden className="size-5" />
                  {i === active && (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-xl ring-2 ring-(--c) opacity-40 motion-safe:animate-ping"
                    />
                  )}
                </button>
                <span
                  className={`mt-2 text-[11px] font-medium transition-colors duration-500 ${
                    lit ? 'text-brand-fg' : 'text-brand-fg/45'
                  }`}
                >
                  {label}
                </span>
              </li>

              {/* Rail to the next station, with the train on it */}
              {next && (
                <li
                  aria-hidden
                  style={{ '--c': color, '--n': next.color } as CSSProperties}
                  className="relative mx-1 mt-5.25 h-0.5 flex-1"
                >
                  <span className="absolute inset-0 rounded-full bg-brand-fg/15" />
                  <span
                    className={`absolute inset-0 origin-left rounded-full bg-linear-to-r from-(--c) to-(--n) transition-transform duration-700 ${
                      i < active ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                  {i === active - 1 && (
                    <span
                      key={active}
                      className="absolute top-1/2 h-1.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--n) shadow-[0_0_12px_var(--n)] motion-safe:animate-travel"
                    />
                  )}
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>

      {/* Details of the station the train is at */}
      <div
        key={active}
        style={{ '--c': step.color } as CSSProperties}
        className="mt-5 rounded-xl border border-brand-fg/10 bg-brand-fg/4 px-4 py-3 motion-safe:animate-fade-up"
      >
        <p className="text-[11px] font-semibold tracking-wide text-(--c)">
          STEP {active + 1} OF {STEPS.length}
        </p>
        <p className="mt-0.5 text-[15px] leading-snug font-medium text-brand-fg">{step.title}</p>
        <p className="mt-1 min-h-[2.1rem] font-mono text-[11px] leading-relaxed text-brand-fg/50">{step.tools}</p>
      </div>
    </div>
  );
}
