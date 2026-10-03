'use client';

import { useActionState, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, Lock, Mail } from 'lucide-react';
import { loginAction, type LoginState } from '@/app/actions/auth';

const INPUT =
  'w-full rounded-lg border border-rule bg-paper/50 py-2.5 pr-3 pl-10 text-[15px] text-ink placeholder:text-ink-soft/60 transition focus:border-ledger focus:bg-surface focus:ring-4 focus:ring-ledger/15 focus:outline-none';

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    error: null,
    email: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ''} />

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <div className="relative">
            <Mail aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={state.email}
              placeholder="you@company.com"
              required
              className={INPUT}
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <div className="relative">
            <Lock aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              className={`${INPUT} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {state.error && (
          <p role="alert" className="rounded-md bg-danger-tint px-3 py-2.5 text-sm text-danger">
            {state.error}
          </p>
        )}

        <button
          disabled={pending}
          className="group flex w-full items-center justify-center gap-2 rounded-lg bg-ledger py-2.5 text-[15px] font-medium text-white shadow-sm transition hover:bg-ledger-dark focus-visible:ring-4 focus-visible:ring-ledger/25 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <>
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight aria-hidden className="size-4 transition group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>

    </div>
  );
}
