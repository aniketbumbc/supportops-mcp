/**
 * Decorative: a stylized version of the refund confirmation the app really shows.
 * It carries the product's promise (a person confirms every money move) without copy.
 */
export function RefundSlip() {
    return (
      <div
        aria-hidden="true"
        className="theme-light w-72 rotate-[-2deg] rounded-md bg-paper p-5 text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] motion-safe:animate-slip-in"
      >
        <div className="flex items-baseline justify-between border-b border-dashed border-rule pb-3">
          <span className="text-sm font-medium">Refund preview</span>
          <span className="text-xs text-ink-soft">INV-2026-0019</span>
        </div>
        <dl className="space-y-1.5 py-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Customer</dt>
            <dd>Acme Traders</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Reason</dt>
            <dd>Duplicate charge</dd>
          </div>
          <div className="flex items-baseline justify-between pt-2">
            <dt className="text-ink-soft">Amount</dt>
            <dd className="text-2xl font-semibold tracking-tight">₹12,400.00</dd>
          </div>
        </dl>
        <div className="flex gap-2">
          <span className="flex-1 rounded bg-ledger py-2 text-center text-sm font-medium text-paper">
            Confirm refund
          </span>
          <span className="rounded border border-rule px-3 py-2 text-sm text-ink-soft">Cancel</span>
        </div>
      </div>
    );
  }