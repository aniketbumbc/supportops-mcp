'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { LogOut, MousePointerClick, Play, ShieldCheck, Sparkles, Timer, X } from 'lucide-react';
import { useAutoStep } from '@/lib/hooks/use-auto-step';

const STEPS = [
  { Icon: MousePointerClick, label: 'Click', title: 'Click “Try demo”', body: 'No sign-up and no password. One click from this page.' },
  { Icon: ShieldCheck, label: 'Signed in', title: 'You’re in as an admin', body: 'A demo admin account opens chat, approvals and the audit log.' },
  { Icon: Sparkles, label: 'Explore', title: 'Try the real flows', body: 'Look up customers, ask about invoices and prepare a refund to confirm.' },
  { Icon: Timer, label: '15 min', title: 'A 15-minute session', body: 'The session ends by itself. One demo per visitor every 30 minutes.' },
  { Icon: LogOut, label: 'Done', title: 'Signed out automatically', body: 'When time is up you’re back at sign-in. Nothing to clean up.' },
];

/** Opens a "Coming soon" preview of the one-click demo. */
export function DemoButton() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-ledger px-3.5 py-1.5 text-sm font-medium text-white shadow-[0_6px_16px_-8px_var(--color-ledger)] transition hover:bg-ledger-dark focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <Play aria-hidden className="size-3.5" fill="currentColor" />
        Try demo
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
        aria-labelledby="demo-title"
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-rule bg-surface p-0 text-ink shadow-[0_32px_80px_-24px_rgba(0,0,0,0.5)] backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
      >
        {open && <DemoPreview onClose={() => dialogRef.current?.close()} />}
      </dialog>
    </>
  );
}

function DemoPreview({ onClose }: { onClose: () => void }) {
  const [active, pick] = useAutoStep(STEPS.length, 2200);
  const step = STEPS[active]!;

  return (
    <div className="relative overflow-hidden p-6 sm:p-7 motion-safe:animate-fade-up">
      <div aria-hidden className="absolute -top-24 -right-16 size-64 rounded-full bg-ledger/15 blur-3xl" />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 rounded-full p-1.5 text-ink-soft transition hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
      >
        <X className="size-4" />
      </button>

      <span className="relative inline-flex items-center gap-2 rounded-full border border-ledger/25 bg-ledger-tint px-2.5 py-0.5 text-xs font-semibold text-ledger">
        <span className="size-1.5 rounded-full bg-ledger motion-safe:animate-pulse" />
        Coming soon
      </span>
      <h2 id="demo-title" className="relative mt-3 text-2xl font-semibold tracking-tight">
        One-click <span className="text-ledger">live demo</span>
      </h2>
      <p className="relative mt-1.5 text-sm text-ink-soft">Here’s how it will work.</p>

      {/* Animated steps */}
      <div className="relative mt-6 flex items-start">
        {STEPS.map(({ Icon, label }, i) => (
          <Fragment key={label}>
            <div className="flex w-12 shrink-0 flex-col items-center text-center">
              <button
                type="button"
                onClick={() => pick(i)}
                aria-label={`Step ${i + 1}: ${label}`}
                aria-current={i === active ? 'step' : undefined}
                className={`relative flex size-10 items-center justify-center rounded-xl border transition-all duration-500 focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none ${
                  i <= active ? 'border-ledger bg-ledger text-white' : 'border-rule bg-paper text-ink-soft'
                } ${i === active ? 'scale-110 shadow-[0_8px_20px_-8px_var(--color-ledger)]' : ''}`}
              >
                <Icon aria-hidden className="size-4.5" />
                {i === active && (
                  <span aria-hidden className="absolute inset-0 rounded-xl ring-2 ring-ledger opacity-40 motion-safe:animate-ping" />
                )}
              </button>
              <span className={`mt-2 text-[11px] font-medium ${i <= active ? 'text-ink' : 'text-ink-soft'}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div aria-hidden className="relative mx-0.5 mt-[18px] h-0.75 flex-1">
                <span
                  className={`absolute inset-0 bg-[radial-gradient(circle,var(--color-ledger)_1.5px,transparent_2px)] bg-size-[10px_3px] bg-repeat-x transition-opacity duration-700 motion-safe:animate-dot-flow ${
                    i < active ? 'opacity-100' : 'opacity-30'
                  }`}
                />
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <div key={active} className="mt-5 rounded-xl bg-paper/70 px-4 py-3 motion-safe:animate-fade-up">
        <p className="text-[11px] font-semibold tracking-wide text-ledger">
          STEP {active + 1} OF {STEPS.length}
        </p>
        <p className="mt-0.5 font-semibold tracking-tight">{step.title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{step.body}</p>
      </div>

      <Countdown />
    </div>
  );
}

const STORAGE_KEY = 'demo-launch-at';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 24-hour countdown, started the first time this browser opens the preview.
 * When it runs out it starts a fresh 24 hours.
 */
function launchTime(): number {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved > Date.now()) return saved;
    const next = Date.now() + DAY_MS;
    localStorage.setItem(STORAGE_KEY, String(next));
    return next;
  } catch {
    return Date.now() + DAY_MS;
  }
}

function Countdown() {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    let target = launchTime();
    const tick = () => {
      if (target - Date.now() <= 0) target = launchTime();
      setLeft(target - Date.now());
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const parts =
    left === null
      ? ['--', '--', '--']
      : [left / 3_600_000, (left / 60_000) % 60, (left / 1000) % 60].map((n) => String(Math.floor(n)).padStart(2, '0'));

  return (
    <div className="mt-6 rounded-2xl border border-ledger/25 bg-ledger-tint/60 p-4 text-center">
      <p className="text-xs font-semibold tracking-wider text-ledger uppercase">Demo goes live in</p>
      <div className="mt-3 flex items-center justify-center gap-2" role="timer" aria-live="off">
        {parts.map((value, i) => (
          <Fragment key={i}>
            <div className="w-16 rounded-xl bg-surface py-2 shadow-sm">
              <span className="block text-2xl font-semibold tracking-tight text-ledger tabular-nums">{value}</span>
              <span className="block text-[10px] font-medium tracking-wider text-ink-soft uppercase">
                {['Hours', 'Minutes', 'Seconds'][i]}
              </span>
            </div>
            {i < 2 && <span className="text-xl font-semibold text-ledger/60 motion-safe:animate-pulse">:</span>}
          </Fragment>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-soft">Until then, sign in with your account or read How it works.</p>
    </div>
  );
}
