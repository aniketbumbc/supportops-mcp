'use client';

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { endDemoAction } from '@/app/actions/auth';

/** "Demo session · ends in 12 min". When time is up, signs out to the login page. */
export function DemoBanner({ endsAt }: { endsAt: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(endsAt).getTime();
    let ended = false;
    const tick = () => {
      const ms = end - Date.now();
      setLeft(ms);
      if (ms <= 0 && !ended) {
        ended = true;
        void endDemoAction();
      }
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [endsAt]);

  const minutes = left === null ? null : Math.ceil(left / 60_000);
  const label =
    minutes === null ? '' : minutes <= 1 ? 'ends in under a minute' : `ends in ${minutes} min`;

  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 border-b px-4 py-2 text-sm ${
        minutes !== null && minutes <= 2
          ? 'border-amber/30 bg-amber-tint text-amber'
          : 'border-ledger/20 bg-ledger-tint text-ledger'
      }`}
    >
      <Timer aria-hidden className="size-4" />
      <span>
        <span className="font-semibold">Demo session</span>
        {label && ` · ${label}`}
      </span>
    </div>
  );
}
