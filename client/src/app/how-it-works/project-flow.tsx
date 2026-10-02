'use client';

import { Fragment } from 'react';
import { Database, MessageSquare, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useAutoStep } from './use-auto-step';

const NODES = [
  {
    Icon: UserRound,
    label: 'You',
    title: 'You ask in plain language',
    body: '“Acme was charged twice this month. Refund the duplicate.” No forms or menus to learn.',
  },
  {
    Icon: MessageSquare,
    label: 'Web app',
    title: 'The app passes it to the assistant',
    body: 'The Next.js app sends your message, with your signed-in identity and role, to the chat agent.',
  },
  {
    Icon: Sparkles,
    label: 'AI agent',
    title: 'The assistant picks the right tools',
    body: 'An OpenAI model decides which MCP tools to call: find the customer, then read their invoices.',
  },
  {
    Icon: ShieldCheck,
    label: 'MCP server',
    title: 'The server checks every call',
    body: 'Your role and refund limits are checked on the server, and every call is written to the audit log.',
  },
  {
    Icon: Database,
    label: 'Systems',
    title: 'Answers come back as cards',
    body: 'CRM, billing and ticketing reply, and you see customers, invoices and refund previews as clear cards.',
  },
];

/** Animated request path: each hop lights up in turn, with a dot travelling along the line. */
export function ProjectFlow() {
  const [active, pick] = useAutoStep(NODES.length, 2400);
  const node = NODES[active]!;

  return (
    <div className="rounded-2xl border border-rule bg-surface p-6 shadow-[0_24px_60px_-32px_rgba(27,42,58,0.35)]">
      <div className="flex items-start">
        {NODES.map(({ Icon, label }, i) => (
          <Fragment key={label}>
            <div className="flex w-14 shrink-0 flex-col items-center text-center sm:w-20">
              <button
                type="button"
                onClick={() => pick(i)}
                aria-label={`Step ${i + 1}: ${label}`}
                aria-current={i === active ? 'step' : undefined}
                className={`relative flex size-11 items-center justify-center rounded-2xl border transition-all duration-500 focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none sm:size-14 ${
                  i <= active ? 'border-ledger bg-ledger text-white' : 'border-rule bg-paper text-ink-soft hover:text-ink'
                } ${i === active ? 'scale-110 shadow-[0_10px_28px_-8px_var(--color-ledger)]' : ''}`}
              >
                <Icon aria-hidden className="size-5 sm:size-6" />
                {i === active && (
                  <span aria-hidden className="absolute inset-0 rounded-2xl ring-2 ring-ledger opacity-40 motion-safe:animate-ping" />
                )}
              </button>
              <span className={`mt-2.5 text-[11px] font-medium sm:text-xs ${i <= active ? 'text-ink' : 'text-ink-soft'}`}>
                {label}
              </span>
            </div>

            {i < NODES.length - 1 && (
              <div aria-hidden className="relative mx-1 mt-5.25 h-0.75 flex-1 sm:mt-6.75">
                {/* Green dots flowing left to right: faint ahead of the active step, bright once passed */}
                <span
                  className={`absolute inset-0 bg-[radial-gradient(circle,var(--color-ledger)_1.5px,transparent_2px)] bg-size-[10px_3px] bg-repeat-x transition-opacity duration-700 motion-safe:animate-dot-flow ${
                    i < active ? 'opacity-100' : 'opacity-30'
                  }`}
                />
                {i === active - 1 && (
                  <span
                    key={active}
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ledger shadow-[0_0_0_4px_var(--color-ledger-tint)] motion-safe:animate-travel"
                  />
                )}
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <div key={active} className="mt-5 rounded-xl bg-paper/70 px-4 py-3 motion-safe:animate-fade-up">
        <p className="text-xs font-semibold tracking-wide text-ledger">
          STEP {active + 1} OF {NODES.length}
        </p>
        <h3 className="mt-0.5 font-semibold tracking-tight">{node.title}</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{node.body}</p>
      </div>
    </div>
  );
}
