import { redirect } from 'next/navigation';
import { KeyRound, ScrollText, ShieldCheck, UserCheck } from 'lucide-react';
import { getCurrentUser, safeNextPath } from '@/lib/session';
import { LoginForm } from './login-form';
import { RefundSlip } from './refund-slip';

const DEV_ACCOUNTS = [
  { email: 'agent@crm.example', role: 'Support agent' },
  { email: 'lead@crm.example', role: 'Support lead' },
  { email: 'finance@crm.example', role: 'Finance' },
  { email: 'admin@crm.example', role: 'Admin' },
];

export const metadata = { title: 'Login' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : undefined;

  // Already logged in with a VALID token → skip the login page.
  if (await getCurrentUser()) redirect(safeNextPath(next));

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Brand panel: slim header on mobile, full column on desktop */}
      <section className="flex flex-col justify-between bg-brand px-6 py-6 text-brand-fg lg:px-14 lg:py-12">
        <p className="text-lg font-semibold tracking-tight">Enterprise SupportOps</p>
        <div className="hidden lg:block">
          <h2 className="max-w-sm text-[2.1rem] leading-[1.15] font-medium tracking-tight">
            Resolve customer issues. Money moves only when a person confirms.
          </h2>
          <div className="mt-12 pl-2">
            <RefundSlip />
          </div>
        </div>
        <p className="hidden text-sm text-brand-fg/60 lg:block">
          Every action is checked against your role and recorded.
        </p>
      </section>

      {/* Form */}
      <section className="relative isolate flex items-center justify-center overflow-hidden px-6 py-12 lg:px-20">
        {/* Soft backdrop: a faint grid fading out from a ledger-green glow */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-rule)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-rule)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 mask-[radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
        />
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -z-10 size-130 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ledger/10 blur-3xl"
        />

        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-rule bg-surface p-8 shadow-[0_20px_50px_-24px_rgba(27,42,58,0.25)] sm:p-10">
            <div className="flex size-11 items-center justify-center rounded-xl bg-ledger-tint text-ledger">
              <ShieldCheck aria-hidden className="size-5" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ledger">Enterprise SupportOps</h1>
            <p className="mt-1.5 text-[15px] text-ink-soft">Sign in with your work account to continue.</p>

            {params.reason === 'expired' && (
              <p className="mt-6 rounded-md bg-amber-tint px-3 py-2.5 text-sm text-amber">
                Your session ended. Sign in again to continue.
              </p>
            )}

            <div className="mt-8">
              <LoginForm
                next={next}
                devAccounts={process.env.NODE_ENV === 'development' ? DEV_ACCOUNTS : undefined}
              />
            </div>
          </div>

          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-ink-soft">
            <li className="flex items-center gap-1.5">
              <KeyRound aria-hidden className="size-3.5" />
              Role-based access
            </li>
            <li className="flex items-center gap-1.5">
              <UserCheck aria-hidden className="size-3.5" />
              Refunds need a person to confirm
            </li>
            <li className="flex items-center gap-1.5">
              <ScrollText aria-hidden className="size-3.5" />
              Every action audited
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}