import type { ReactNode } from 'react';

/** Shared building blocks for tool-result cards. */

export function Card({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-rule bg-white">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule bg-paper/60 px-4 py-2.5">
        <h3 className="text-sm font-medium">{title}</h3>
        {meta && <div className="text-xs text-ink-soft">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'bg-ink/[0.06] text-ink-soft',
  good: 'bg-ledger-tint text-ledger',
  warn: 'bg-amber-tint text-amber',
  bad: 'bg-danger-tint text-danger',
  info: 'bg-ink text-paper',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Colour for common status values across customers, tickets, invoices, subscriptions. */
export function statusTone(status: string): Tone {
  if (['active', 'paid', 'resolved', 'closed', 'succeeded'].includes(status)) return 'good';
  if (['suspended', 'past_due', 'pending', 'partially_refunded', 'trialing'].includes(status)) return 'warn';
  if (['uncollectible', 'failed'].includes(status)) return 'bad';
  return 'neutral';
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export function ActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-ledger/30 px-2.5 py-1 text-xs font-medium text-ledger hover:bg-ledger-tint focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}