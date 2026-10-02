'use client';

import { useEffect, useRef, useState } from 'react';

const PAUSE_AFTER_PICK_MS = 8000;

/**
 * Steps through 0..count-1 on a timer, looping. Picking a step by hand pauses the
 * timer for a few seconds. With reduced motion turned on, it never advances by itself.
 */
export function useAutoStep(count: number, intervalMs: number) {
  const [index, setIndex] = useState(0);
  const pausedUntil = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs]);

  const pick = (i: number) => {
    pausedUntil.current = Date.now() + PAUSE_AFTER_PICK_MS;
    setIndex(i);
  };

  return [index, pick] as const;
}
