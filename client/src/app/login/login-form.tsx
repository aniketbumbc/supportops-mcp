'use client';

import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useActionState, useRef, useState } from 'react';
import { loginAction, type LoginState } from '@/app/actions/auth';

interface Props {
  next?: string;
  /** Development only: seeded accounts, shown as one-click fill buttons. */
  devAccounts?: { email: string; role: string }[];
}

export function LoginForm({ next, devAccounts }: Props) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    error: null,
    email: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const fill = (email: string) => {
    if (emailRef.current) emailRef.current.value = email;
    if (passwordRef.current) {
      passwordRef.current.value = 'ChangeMe-2026!';
      passwordRef.current.focus();
    }
  };

  const inputClass =
    'mt-1.5 block w-full rounded-md border bg-white px-3 py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-ledger focus:ring-3 focus:ring-ledger/15';
  const errorBorder = state.error ? 'border-danger/60' : 'border-rule';

  return (
    <>
      <form action={formAction} className="space-y-5" noValidate>
        <input type="hidden" name="next" value={next ?? ''} />

        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            defaultValue={state.email}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? 'login-error' : undefined}
            className={`${inputClass} ${errorBorder}`}
          />
        </div>

        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <div className="relative">
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              aria-invalid={Boolean(state.error)}
              aria-describedby={state.error ? 'login-error' : undefined}
              className={`${inputClass} ${errorBorder} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 mt-1.5 flex w-11 items-center justify-center rounded-r-md text-ink-soft hover:text-ink focus-visible:ring-3 focus-visible:ring-ledger/30 focus-visible:outline-none"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {state.error && (
          <p
            id="login-error"
            role="alert"
            className="flex items-start gap-2 rounded-md bg-danger-tint px-3 py-2.5 text-sm text-danger"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-ledger py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-ledger-dark focus-visible:ring-3 focus-visible:ring-ledger/40 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-70"
        >
          {pending && <Loader2 size={16} className="animate-spin" />}
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {devAccounts && devAccounts.length > 0 && (
        <div className="mt-10 border-t border-rule pt-5">
          <p className="text-sm text-ink-soft">Test accounts (development only)</p>
          <ul className="mt-2 space-y-1">
            {devAccounts.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => fill(a.email)}
                  className="flex w-full items-baseline justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-ledger-tint focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
                >
                  <span>{a.email}</span>
                  <span className="text-ink-soft">{a.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}