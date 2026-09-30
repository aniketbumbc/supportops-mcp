import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-ledger">404</p>
        <h1 className="mt-2 text-xl font-semibold">There’s no page here</h1>
        <p className="mt-2 text-sm text-ink-soft">The link may be old, or the address has a typo.</p>
        <Link
          href="/chat"
          className="mt-6 inline-block rounded-md bg-ledger px-4 py-2 text-sm font-medium text-paper hover:bg-ledger-dark"
        >
          Go to the assistant
        </Link>
      </div>
    </main>
  );
}