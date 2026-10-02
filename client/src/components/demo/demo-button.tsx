'use client';

import { useActionState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { demoLoginAction, type DemoState } from '@/app/actions/auth';

/**
 * One click → a 15-minute demo session as the demo admin, then on to /chat.
 * The server allows one demo per visitor every 30 minutes; when limited, the
 * message ("Demo available again in N minutes.") shows under the button.
 */
export function DemoButton() {
  const [state, action, pending] = useActionState<DemoState>(demoLoginAction, { error: null });

  return (
    <form action={action} className="relative">
      <button
        type="submit"
        disabled={pending}
        aria-describedby={state.error ? 'demo-error' : undefined}
        className="flex items-center gap-1.5 rounded-full bg-ledger px-3.5 py-1.5 text-sm font-medium text-white shadow-[0_6px_16px_-8px_var(--color-ledger)] transition hover:bg-ledger-dark focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-80"
      >
        {pending ? (
          <Loader2 aria-hidden className="size-3.5 motion-safe:animate-spin" />
        ) : (
          <Play aria-hidden className="size-3.5" fill="currentColor" />
        )}
        {pending ? 'Starting demo…' : 'Try demo'}
      </button>

      {state.error && !pending && (
        <p
          id="demo-error"
          role="alert"
          className="absolute top-full right-0 z-10 mt-2 w-60 rounded-lg border border-amber/30 bg-amber-tint px-3 py-2 text-xs text-amber shadow-sm motion-safe:animate-fade-up"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
