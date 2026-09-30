'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Shown when a page fails to load (for example, the support server is down).
 * The shell (sidebar) stays usable; "Try again" re-fetches just this page.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto text-amber" size={28} />
        <h1 className="mt-4 text-lg font-semibold">This page couldn’t load</h1>
        <p className="mt-2 text-sm text-ink-soft">
          The support server may be busy or unreachable. Nothing was changed. Try again in a moment.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-ink-soft">Reference: {error.digest}</p>}
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-ledger px-4 py-2 text-sm font-medium text-paper hover:bg-ledger-dark focus-visible:ring-3 focus-visible:ring-ledger/40 focus-visible:outline-none"
        >
          <RotateCcw size={15} /> Try again
        </button>
      </div>
    </div>
  );
}