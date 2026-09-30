'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from '@/app/actions/auth';

/** Minimal form for Step 3; Step 4 gives the login page its proper design. */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    error: null,
    email: '',
  });

  const submit = (formData: FormData) => {
    console.log('[1 UI] submit', formData.get('email'), formData.get('password'));
    return formAction(formData);
  };

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="next" value={next ?? ''} />
      <input
        name="email"
        type="email"
        defaultValue={state.email}
        placeholder="Email"
        required
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
      />
      <input
        name="password"
        type="password"
        placeholder="Password"
        required
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}