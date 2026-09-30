'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-rule bg-surface px-2.5 py-1 text-xs font-medium hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
    >
      {copied ? <Check size={13} className="text-ledger" /> : <Copy size={13} />}
      {copied ? 'Copied' : label}
    </button>
  );
}