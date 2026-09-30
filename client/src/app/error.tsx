'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Last-resort error page: catches failures in layouts too (e.g. the support server
 * is down while checking your session), where the sidebar itself can't render.
 * "Try again" does a full reload: after a layout failure that reliably re-runs
 * everything (session check included) once the server is back.
 */
export default function RootError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto text-amber" size={28} />
        <h1 className="mt-4 text-lg font-semibold">SupportOps can’t reach its server</h1>
        <p className="mt-2 text-sm text-ink-soft">
          The support server may be restarting or unreachable. Nothing was changed. Try again in a moment.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-ink-soft">Reference: {error.digest}</p>}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-ledger px-4 py-2 text-sm font-medium text-paper hover:bg-ledger-dark focus-visible:ring-3 focus-visible:ring-ledger/40 focus-visible:outline-none"
        >
          <RotateCcw size={15} /> Try again
        </button>
      </div>
    </main>
  );
}