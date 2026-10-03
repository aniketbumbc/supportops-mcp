'use client';

import { useActionState } from 'react';
import { LoaderCircle, Play } from 'lucide-react';
import { demoLoginAction, type DemoState } from '@/app/actions/auth';

/** Under the sign-in form: a clear second way in for visitors without an account. */
export function DemoInvite() {
  const [state, action, pending] = useActionState<DemoState>(demoLoginAction, { error: null });

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-rule" />
        or
        <span className="h-px flex-1 bg-rule" />
      </div>

      <form
        action={action}
        className="mt-3 flex items-center gap-3 rounded-xl border border-ledger/25 bg-ledger-tint/60 p-3.5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ledger text-white shadow-[0_6px_16px_-8px_var(--color-ledger)]">
          <Play aria-hidden className="size-4" fill="currentColor" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Try the live demo</p>
          <p className="mt-0.5 text-xs text-ink-soft">No sign-up · admin access · 15 minutes</p>
        </div>
        <button
          type="submit"
          disabled={pending}
          aria-describedby={state.error ? 'demo-invite-error' : undefined}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ledger px-3.5 py-2 text-sm font-medium text-white transition hover:bg-ledger-dark focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-80"
        >
          {pending && <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />}
          {pending ? 'Starting…' : 'Start demo'}
        </button>
      </form>

      {state.error && !pending && (
        <p id="demo-invite-error" role="alert" className="mt-2 rounded-md bg-amber-tint px-3 py-2 text-xs text-amber">
          {state.error}
        </p>
      )}
    </div>
  );
}
