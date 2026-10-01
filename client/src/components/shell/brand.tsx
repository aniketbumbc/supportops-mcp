import { Sparkles } from 'lucide-react';

/** App logo mark and name, shared by the sidebar and the mobile nav. */
export function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ledger text-white shadow-[0_6px_16px_-8px_var(--color-ledger)]"
      >
        <Sparkles className="size-[18px]" />
      </span>
      <span className="leading-tight">
        <span className="block text-[11px] font-medium tracking-wider text-ledger uppercase">Enterprise</span>
        <span className="block text-base font-semibold tracking-tight">SupportOps</span>
      </span>
    </span>
  );
}
