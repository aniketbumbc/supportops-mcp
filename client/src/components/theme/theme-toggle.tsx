'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY } from './theme-script';

type Theme = 'light' | 'dark' | 'system';

function readTheme(): Theme {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage blocked: the choice still applies until the page reloads */
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

/** Light / Dark / System switch. The choice is saved in this browser. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  // The server can't know the saved choice, so it renders "system" and the browser corrects it.
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`inline-flex items-center gap-0.5 rounded-full border border-rule bg-surface p-1 shadow-[0_1px_2px_rgba(27,42,58,0.06)] ${className}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => applyTheme(value)}
            className={`flex size-7 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none ${
              active ? 'bg-ledger text-white shadow-sm' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
            }`}
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
