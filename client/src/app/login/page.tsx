import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, BookOpen, Code, KeyRound, ScrollText, ShieldCheck, UserCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { getCurrentUser, safeNextPath } from '@/lib/session';
import { LoginForm } from './login-form';
import { AgentDemo } from './agent-demo';
import { CapabilitySteps } from './capability-steps';
import { DemoInvite } from './demo-invite';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : undefined;

  // Already logged in with a VALID token → skip the login page.
  if (await getCurrentUser()) redirect(safeNextPath(next));

  return (
    <main className="grid min-h-screen lg:h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:overflow-hidden">
      {/* Brand panel: slim header on mobile, full column on desktop */}
      <section className="flex flex-col bg-brand px-6 py-6 text-brand-fg lg:overflow-hidden lg:px-14 lg:py-8">
        {/* Desktop: one centred column; the steps and agent card sit in the middle of it. */}
        <div className="lg:mx-auto lg:flex lg:w-full lg:max-w-md lg:flex-1 lg:flex-col">
          <p className="text-xl font-bold tracking-tight text-[#34a386] lg:text-[1.7rem]">Enterprise SupportOps</p>
          <h2 className="mt-3 hidden text-lg leading-snug text-brand-fg/75 lg:block">
            Everything CRM support needs, in one window.
          </h2>
          <div className="hidden flex-1 flex-col justify-center py-8 lg:flex">
            <CapabilitySteps />
            <AgentDemo />
          </div>
          <p className="hidden text-sm text-brand-fg/60 lg:block">
            Every action is checked against your role and recorded.
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="relative isolate flex items-center justify-center overflow-hidden px-6 pt-20 pb-10 lg:overflow-y-auto lg:px-20">
        {/* Soft backdrop: a faint grid fading out from a ledger-green glow */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-rule)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-rule)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 mask-[radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
        />
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -z-10 size-130 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ledger/10 blur-3xl"
        />

        <div className="absolute top-5 right-6 flex items-center gap-2 lg:right-8">
          <Link
            href="/how-it-works"
            className="flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-soft shadow-[0_1px_2px_rgba(27,42,58,0.06)] transition hover:border-ledger/40 hover:text-ledger focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
          >
            <BookOpen aria-hidden className="size-4" />
            How it works
          </Link>
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-rule bg-surface p-8 shadow-[0_20px_50px_-24px_rgba(27,42,58,0.25)] sm:px-10 sm:py-8">
            <div className="flex size-11 items-center justify-center rounded-xl bg-ledger-tint text-ledger">
              <ShieldCheck aria-hidden className="size-5" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ledger">Enterprise SupportOps</h1>
            <p className="mt-1.5 text-[15px] text-ink-soft">Sign in with your work account to continue.</p>

            {params.reason === 'expired' && (
              <p className="mt-6 rounded-md bg-amber-tint px-3 py-2.5 text-sm text-amber">
                Your session ended. Sign in again to continue.
              </p>
            )}
            {params.reason === 'demo-ended' && (
              <p className="mt-6 rounded-md bg-ledger-tint px-3 py-2.5 text-sm text-ledger">
                Demo ended. Thanks for trying it! Sign in, or try the demo again later.
              </p>
            )}

            <div className="mt-6">
              <LoginForm next={next} />
              <DemoInvite />
            </div>
          </div>

          <ul className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-ink-soft">
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

        <a
          href="https://www.aniketbdev.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="group absolute bottom-5 left-6 flex items-center gap-2 rounded-full border border-rule bg-surface py-1.5 pr-3.5 pl-1.5 text-sm shadow-[0_8px_24px_-12px_rgba(27,42,58,0.35)] transition hover:-translate-y-0.5 hover:border-ledger/40 hover:shadow-[0_12px_28px_-12px_var(--color-ledger)] focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none lg:left-8"
        >
          <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-ledger text-white shadow-sm">
            <Code className="size-3.5" />
          </span>
          <span className="text-ink-soft">
            Developed by <span className="font-semibold text-ledger">Aniket B</span>
          </span>
        </a>
      </section>
    </main>
  );
}