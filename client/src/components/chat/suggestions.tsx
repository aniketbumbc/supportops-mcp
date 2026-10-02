'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Ban, Check, ChevronDown, Hourglass, ReceiptText, Search, Ticket, UserRound } from 'lucide-react';

/** A guided first question: what to ask, and what the user will see happen. */
export interface Suggestion {
  group: 'lookup' | 'refunds' | 'tickets';
  icon: keyof typeof SUGGESTION_ICONS;
  /** Short label for the chip strip shown while chatting. */
  chip: string;
  prompt: string;
  hint: string;
}

const SUGGESTION_ICONS = {
  search: Search,
  user: UserRound,
  refund: ReceiptText,
  blocked: Ban,
  approval: Hourglass,
  ticket: Ticket,
};

const SUGGESTION_GROUPS: { id: Suggestion['group']; title: string }[] = [
  { id: 'lookup', title: 'Look things up' },
  { id: 'refunds', title: 'Refunds & safety rules' },
  { id: 'tickets', title: 'Tickets' },
];

interface ListProps {
  suggestions: Suggestion[];
  /** Prompts already sent in this chat: shown with a check. */
  asked?: Set<string>;
  onPick: (prompt: string) => void;
}

/** The guided cards, grouped and numbered. Used on the empty chat and in the "All" panel. */
export function SuggestionGroups({ suggestions, asked, onPick }: ListProps) {
  return (
    <div className="space-y-6">
      {SUGGESTION_GROUPS.map((g, gi) => {
        const items = suggestions.filter((s) => s.group === g.id);
        if (items.length === 0) return null;
        return (
          <section key={g.id} aria-labelledby={`suggest-${g.id}`}>
            <h3
              id={`suggest-${g.id}`}
              className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-soft uppercase"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-ledger-tint text-[11px] text-ledger">
                {gi + 1}
              </span>
              {g.title}
            </h3>
            <ul className="mt-2.5 grid gap-3 sm:grid-cols-2">
              {items.map((s) => {
                const Icon = SUGGESTION_ICONS[s.icon];
                const done = asked?.has(s.prompt) ?? false;
                return (
                  <li key={s.prompt}>
                    <button
                      type="button"
                      onClick={() => onPick(s.prompt)}
                      className="group flex h-full w-full items-start gap-3 rounded-xl border border-rule bg-surface p-4 text-left text-sm shadow-[0_1px_2px_rgba(27,42,58,0.04)] transition hover:-translate-y-0.5 hover:border-ledger/40 hover:shadow-[0_10px_24px_-14px_rgba(27,42,58,0.35)] focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ledger-tint text-ledger">
                        <Icon aria-hidden className="size-4" />
                      </span>
                      <span className="flex-1 pt-1">
                        <span className="block leading-snug font-medium text-ink">{s.prompt}</span>
                        <span className="mt-1 block text-xs leading-snug text-ink-soft">{s.hint}</span>
                      </span>
                      {done ? (
                        <span className="mt-1 flex shrink-0 items-center gap-1 text-xs font-medium text-ledger">
                          <Check aria-hidden className="size-3.5" />
                          Asked
                        </span>
                      ) : (
                        <ArrowUpRight
                          aria-hidden
                          className="mt-1.5 size-4 shrink-0 text-ink-soft opacity-0 transition group-hover:opacity-100"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * While chatting: a row of chips for the questions not asked yet, plus "All" to open
 * every card (with hints and checks). Hidden while the assistant is answering.
 */
export function SuggestionStrip({ suggestions, asked, onPick, busy }: ListProps & { busy: boolean }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const remaining = suggestions.filter((s) => !asked?.has(s.prompt));

  // Escape or a click outside closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (busy || remaining.length === 0) return null;

  const pick = (prompt: string) => {
    setOpen(false);
    onPick(prompt);
  };

  return (
    <div ref={panelRef} className="relative mb-2.5">
      {open && (
        <div
          id="suggestion-panel"
          className="absolute right-0 bottom-full left-0 z-20 mb-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-rule bg-surface p-4 shadow-[0_24px_60px_-24px_rgba(27,42,58,0.45)] motion-safe:animate-fade-up"
        >
          <SuggestionGroups suggestions={suggestions} asked={asked} onPick={pick} />
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-ink-soft">Try next:</span>
        <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
          {remaining.map((s) => {
            const Icon = SUGGESTION_ICONS[s.icon];
            return (
              <li key={s.prompt} className="shrink-0">
                <button
                  type="button"
                  onClick={() => pick(s.prompt)}
                  title={s.prompt}
                  className="flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ledger/40 hover:text-ledger focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
                >
                  <Icon aria-hidden className="size-3.5 text-ledger" />
                  {s.chip}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="suggestion-panel"
          className="flex shrink-0 items-center gap-1 rounded-full bg-ledger-tint px-3 py-1.5 text-xs font-semibold text-ledger transition hover:bg-ledger/15 focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
        >
          All
          <ChevronDown aria-hidden className={`size-3.5 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
}
