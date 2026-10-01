/**
 * Decorative slips for the login brand panel. Stylized copies of the real chat
 * cards; they carry the product's promise without being interactive.
 */

export function RefundSlip() {
  return (
    <div aria-hidden="true" className="motion-safe:animate-slip-in">
    <div
      className="theme-light w-72 -rotate-6 rounded-md bg-paper p-5 text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]"
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
    </div>
  );
}

/** Stylized invoices card: the duplicate charge the refund slip is about. */
export function InvoiceSlip() {
  return (
    <div aria-hidden="true" className="ml-8 motion-safe:animate-slip-in" style={{ animationDelay: '220ms' }}>
    <div
      className="theme-light w-72 rotate-6 overflow-hidden rounded-lg border border-rule bg-surface text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-baseline justify-between border-b border-rule bg-paper/60 px-4 py-2.5">
        <span className="text-sm font-medium">Invoices · CUS-1001</span>
        <span className="text-xs text-ink-soft">5 total</span>
      </div>
      <div className="bg-danger-tint/40 px-4 py-3">
        <p className="text-sm font-medium">INV-2026-0019</p>
        <p className="text-xs text-ink-soft">Monthly subscription</p>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-lg font-semibold tracking-tight">₹12,400.00</span>
          <span className="text-xs text-danger">2 payments</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded bg-amber-tint px-1.5 py-0.5 text-xs font-medium text-amber">
            Partially refunded
          </span>
          <span className="rounded bg-danger-tint px-1.5 py-0.5 text-xs font-medium text-danger">
            Paid twice
          </span>
        </div>
      </div>
    </div>
    </div>
  );
}