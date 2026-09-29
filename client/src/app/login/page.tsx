import { redirect } from 'next/navigation';
import { getCurrentUser, safeNextPath } from '@/lib/session';
import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : undefined;

  // Already logged in with a VALID token → skip the login page.
  if (await getCurrentUser()) redirect(safeNextPath(next));

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold">Sign in to SupportOps</h1>
        {params.reason === 'expired' && (
          <p className="mb-3 text-sm text-amber-700">Your session expired. Please sign in again.</p>
        )}
        <LoginForm next={next} />
      </div>
    </main>
  );
}