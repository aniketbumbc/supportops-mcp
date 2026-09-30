import { redirect } from 'next/navigation';
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
        <p className="text-lg font-semibold tracking-tight">SupportOps</p>
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
      <section className="flex items-center px-6 py-12 lg:px-20">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-[15px] text-ink-soft">Use your work account.</p>

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
      </section>
    </main>
  );
}