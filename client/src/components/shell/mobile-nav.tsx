'use client';

import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Top bar with a menu button on small screens; opens the sidebar as a drawer.
 * `children` is plain JSX from the server layout (functions can't be passed from
 * server to client components), so the drawer closes itself when the page changes.
 */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const pathname = usePathname();

  // Navigating (clicking a link in the drawer) closes it.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <header className="flex items-center justify-between border-b border-rule bg-paper px-4 py-3">
        <span className="text-base font-semibold tracking-tight">Enterprise SupportOps</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="rounded-md p-2 text-ink hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
        >
          <Menu size={20} />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/40" onClick={close} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-paper shadow-xl">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-base font-semibold tracking-tight">Enterprise SupportOps</span>
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="rounded-md p-2 hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
              >
                <X size={20} />
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}