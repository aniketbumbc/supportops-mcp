'use client';

import { useEffect, useState } from 'react';
import { Check, Hourglass, Sparkles } from 'lucide-react';

/**
 * A looping, made-up agent run: a request comes in, the assistant calls MCP tools
 * one by one (coloured like the capability steps), then shows the outcome.
 * With reduced motion it shows the finished first run and stays still.
 */

const TOOL_COLOR: Record<string, string> = {
  find_customer: '#34d399',
  get_customer_invoices: '#38bdf8',
  search_customer_tickets: '#fbbf24',
  create_support_ticket: '#fbbf24',
  issue_refund: '#a78bfa',
};

interface Run {
  ask: string;
  calls: { tool: string; result: string }[];
  outcome: string;
  /** The outcome waits on a person (refunds) rather than being done. */
  waiting?: boolean;
}

const RUNS: Run[] = [
  {
    ask: 'Acme was charged twice. Refund the duplicate.',
    calls: [
      { tool: 'find_customer', result: 'Acme Traders · CUS-1001' },
      { tool: 'get_customer_invoices', result: 'INV-2026-0019 paid twice' },
      { tool: 'issue_refund', result: '₹12,400.00 prepared' },
    ],
    outcome: 'Waiting for you to confirm the refund',
    waiting: true,
  },
  {
    ask: 'Pinewood Labs has a failed payment. Open a ticket.',
    calls: [
      { tool: 'find_customer', result: 'Pinewood Labs · CUS-1006' },
      { tool: 'get_customer_invoices', result: '1 overdue, last payment failed' },
      { tool: 'create_support_ticket', result: 'Ticket opened, priority high' },
    ],
    outcome: 'Ticket created and linked to the invoice',
  },
  {
    ask: 'Show open tickets for Quartz Media',
    calls: [
      { tool: 'find_customer', result: 'Quartz Media · CUS-1005' },
      { tool: 'search_customer_tickets', result: '2 open tickets' },
    ],
    outcome: 'Hidden instructions in a ticket were ignored',
  },
];

const TYPE_MS = 28;
const THINK_MS = 700;
const CALL_MS = 900;
const HOLD_MS = 2600;

export function AgentDemo() {
  const [run, setRun] = useState(0);
  // How far this run has got: characters typed, then calls shown, then the outcome.
  const [typed, setTyped] = useState(0);
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);
  const [still, setStill] = useState(false);

  const current = RUNS[run]!;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = setTimeout(() => setStill(true), 0);
      return () => clearTimeout(id);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    let t = 0;
    at(t, () => {
      setTyped(0);
      setShown(0);
      setDone(false);
    });
    for (let c = 1; c <= current.ask.length; c++) at((t += TYPE_MS), () => setTyped(c));
    t += THINK_MS;
    for (let k = 1; k <= current.calls.length; k++) at((t += CALL_MS), () => setShown(k));
    at((t += CALL_MS), () => setDone(true));
    at(t + HOLD_MS, () => setRun((r) => (r + 1) % RUNS.length));

    return () => timers.forEach(clearTimeout);
  }, [run, current]);

  const askText = still ? current.ask : current.ask.slice(0, typed);
  const callsShown = still ? current.calls.length : shown;
  const finished = still || done;
  const typing = !still && typed < current.ask.length;
  const thinking = !still && !typing && callsShown < current.calls.length;

  return (
    <div
      aria-hidden
      className="mt-10 w-full rounded-2xl border border-brand-fg/10 bg-brand-fg/4 [@media(max-height:680px)]:hidden p-4 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.6)]"
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-brand-fg/50 uppercase">
        <span className="size-1.5 rounded-full bg-[#34d399] motion-safe:animate-pulse" />
        AI agent · live run
      </div>

      {/* The request */}
      <div className="mt-3 flex h-[3.4rem] items-start justify-end">
        {/* The full text, invisible, sizes the bubble so it doesn't grow while typing. */}
        <p className="grid max-w-[85%] rounded-2xl rounded-br-md bg-brand-fg/10 px-3 py-2 text-[13px] leading-snug text-brand-fg">
          <span className="invisible col-start-1 row-start-1">{current.ask}</span>
          <span className="col-start-1 row-start-1">
            {askText}
            {typing && <span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-brand-fg motion-safe:animate-pulse" />}
          </span>
        </p>
      </div>

      {/* Tool calls */}
      <div className="mt-3 flex gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#34d399]/15 text-[#34d399]">
          <Sparkles className="size-3.5" />
        </span>
        <ul className="h-[8.75rem] min-w-0 flex-1 space-y-1.5 overflow-hidden">
          {current.calls.slice(0, callsShown).map(({ tool, result }) => (
            <li
              key={tool}
              style={{ borderColor: `${TOOL_COLOR[tool]}55` }}
              className="flex items-center gap-2 rounded-lg border bg-brand/40 px-2.5 py-1.5 motion-safe:animate-fade-up"
            >
              <Check className="size-3.5 shrink-0" style={{ color: TOOL_COLOR[tool] }} />
              <span className="font-mono text-[11px]" style={{ color: TOOL_COLOR[tool] }}>
                {tool}
              </span>
              <span className="truncate text-[11px] text-brand-fg/60">{result}</span>
            </li>
          ))}
          {thinking && (
            <li className="flex items-center gap-1 px-1 py-2">
              <span className="size-1.5 animate-bounce rounded-full bg-brand-fg/50 [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-brand-fg/50 [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-brand-fg/50" />
            </li>
          )}
          {finished && (
            <li
              className={`flex items-center gap-2 px-1 pt-1 text-[12px] font-medium motion-safe:animate-fade-up ${
                current.waiting ? 'text-[#a78bfa]' : 'text-[#34d399]'
              }`}
            >
              {current.waiting ? <Hourglass className="size-3.5" /> : <Check className="size-3.5" />}
              {current.outcome}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
