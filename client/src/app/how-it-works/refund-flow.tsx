'use client';

import { Check, CheckCircle2, Clock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAutoStep } from '@/lib/hooks/use-auto-step';

type Step = 'Preview' | 'Confirm' | 'Limit check' | 'Approval' | 'Refunded';

const SCENARIOS = [
  { key: 'within', label: 'Within your limit', amount: '₹4,800', steps: ['Preview', 'Confirm', 'Limit check', 'Refunded'] },
  {
    key: 'over',
    label: 'Over your limit',
    amount: '₹12,400',
    steps: ['Preview', 'Confirm', 'Limit check', 'Approval', 'Refunded'],
  },
] as const satisfies readonly { key: string; label: string; amount: string; steps: readonly Step[] }[];

/** Both scenarios played back to back: 4 steps, then 5. */
const TIMELINE = SCENARIOS.flatMap((s, scenario) => s.steps.map((_, step) => ({ scenario, step })));

/** Animated refund: preview → confirm → limit check → refunded, or via approval when over the limit. */
export function RefundFlow() {
  const [index, pick] = useAutoStep(TIMELINE.length, 2000);
  const { scenario: si, step } = TIMELINE[index]!;
  const scenario = SCENARIOS[si]!;
  const current: Step = scenario.steps[step]!;
  const over = scenario.key === 'over';

  const startOf = (s: number) => TIMELINE.findIndex((t) => t.scenario === s);

  return (
    <div className="rounded-2xl border border-rule bg-surface p-6 shadow-[0_24px_60px_-32px_rgba(27,42,58,0.35)]">
      {/* Scenario switch */}
      <div role="tablist" aria-label="Refund scenario" className="inline-flex rounded-full bg-paper p-1 text-sm">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={i === si}
            onClick={() => pick(startOf(i))}
            className={`rounded-full px-4 py-1.5 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none ${
              i === si ? 'bg-surface text-ledger shadow-sm' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[170px_1fr] md:gap-5">
        {/* Stepper */}
        <ol className="space-y-1">
          {scenario.steps.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => pick(startOf(si) + i)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-sm transition-colors duration-500 focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none ${
                  i === step ? 'bg-ledger-tint' : 'hover:bg-ink/[0.03]'
                }`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-500 ${
                    i < step
                      ? 'bg-ledger text-white'
                      : i === step
                        ? 'bg-ledger text-white ring-4 ring-ledger/20'
                        : 'bg-ink/[0.06] text-ink-soft'
                  }`}
                >
                  {i < step ? <Check aria-hidden className="size-3.5" /> : i + 1}
                </span>
                <span className={i <= step ? 'font-medium text-ink' : 'text-ink-soft'}>{s}</span>
              </button>
            </li>
          ))}
        </ol>

        {/* Mock refund card */}
        <div className="rounded-xl border border-rule bg-paper/60 p-4">
          <div className="flex items-baseline justify-between border-b border-dashed border-rule pb-3">
            <span className="text-sm font-medium">Refund preview</span>
            <span className="text-xs text-ink-soft">INV-2026-0019</span>
          </div>
          <dl className="space-y-1 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Customer</dt>
              <dd>Acme Traders</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Reason</dt>
              <dd>Duplicate charge</dd>
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <dt className="text-ink-soft">Amount</dt>
              <dd className="text-2xl font-semibold tracking-tight">{scenario.amount}</dd>
            </div>
          </dl>

          <div key={`${si}-${step}`} className="motion-safe:animate-fade-up">
            {current === 'Preview' && (
              <div className="space-y-3">
                <p className="text-xs text-ink-soft">Nothing has happened yet. You decide.</p>
                <div className="flex gap-2">
                  <span className="flex-1 rounded-lg bg-ledger py-2 text-center text-sm font-medium text-white">
                    Confirm refund
                  </span>
                  <span className="rounded-lg border border-rule px-3 py-2 text-sm text-ink-soft">Cancel</span>
                </div>
              </div>
            )}
            {current === 'Confirm' && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-ledger">You confirmed the refund.</p>
                <div className="flex gap-2">
                  <span className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ledger-dark py-2 text-sm font-medium text-white ring-4 ring-ledger/25">
                    <Check aria-hidden className="size-4" /> Confirmed
                  </span>
                  <span className="rounded-lg border border-rule px-3 py-2 text-sm text-ink-soft opacity-50">Cancel</span>
                </div>
              </div>
            )}
            {current === 'Limit check' && (
              <Status
                tone={over ? 'warn' : 'good'}
                icon={over ? <ShieldAlert className="size-4" /> : <ShieldCheck className="size-4" />}
                title={over ? 'Over your direct limit' : 'Within your direct limit'}
                body={`${scenario.amount} vs your ₹10,000 limit as a support lead.`}
              />
            )}
            {current === 'Approval' && (
              <Status
                tone="warn"
                icon={<Clock className="size-4" />}
                title="Sent for approval"
                body="Waiting for a finance user to approve or reject it in the Approvals queue."
              />
            )}
            {current === 'Refunded' && (
              <Status
                tone="good"
                icon={<CheckCircle2 className="size-4" />}
                title="Refunded · REF-2026-0042"
                body={over ? 'Approved by Meera Iyer (Finance). Recorded in the audit log.' : 'Done in one step. Recorded in the audit log.'}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Status({
  tone,
  icon,
  title,
  body,
}: {
  tone: 'good' | 'warn';
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      className={`flex gap-3 rounded-xl px-4 py-3 ${tone === 'good' ? 'bg-ledger-tint text-ledger' : 'bg-amber-tint text-amber'}`}
    >
      <span aria-hidden className="mt-0.5 shrink-0">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{body}</p>
      </div>
    </div>
  );
}
