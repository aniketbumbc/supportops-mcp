'use client';

import { formatDate, formatMoney, humanize } from '@/lib/format';
import type { InvoicesData } from '@/lib/tool-data';
import { useChatActions } from './chat-actions';
import { ActionButton, Badge, Card, statusTone } from './cardui';

const FLAG_LABELS: Record<string, { label: string; tone: 'bad' | 'warn' }> = {
  duplicate_payment_suspected: { label: 'Paid twice', tone: 'bad' },
  overdue: { label: 'Overdue', tone: 'bad' },
  outside_refund_window: { label: 'Outside refund window', tone: 'warn' },
};

export function InvoicesCard({ data, customerRef }: { data: InvoicesData; customerRef?: string }) {
  const { send, busy, canRefund } = useChatActions();

  if (data.invoices.length === 0) {
    return (
      <Card title="Invoices">
        <p className="px-4 py-3 text-sm text-ink-soft">No invoices found.</p>
      </Card>
    );
  }

  return (
    <Card
      title={`Invoices${customerRef ? ` · ${customerRef}` : ''}`}
      meta={data.next_cursor ? 'More available' : undefined}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-soft">
              <th className="px-4 py-2 font-normal">Invoice</th>
              <th className="px-2 py-2 font-normal">Issued</th>
              <th className="px-2 py-2 text-right font-normal">Amount</th>
              <th className="px-2 py-2 text-right font-normal">Refundable</th>
              <th className="px-4 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule border-t border-rule">
            {data.invoices.map((inv) => {
              const duplicate = inv.flags.includes('duplicate_payment_suspected');
              return (
                <tr key={inv.invoice_number} className={duplicate ? 'bg-danger-tint/40' : undefined}>
                  <td className="px-4 py-2.5 align-top">
                    <div className="font-medium">{inv.invoice_number}</div>
                    <div className="max-w-[220px] truncate text-xs text-ink-soft" title={inv.description}>
                      {inv.description}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 align-top whitespace-nowrap text-ink-soft">
                    {formatDate(inv.issued_at)}
                  </td>
                  <td className="px-2 py-2.5 text-right align-top whitespace-nowrap">
                    {formatMoney(inv.amount_minor, inv.currency)}
                    {inv.payment_count > 1 && (
                      <div className="text-xs text-danger">{inv.payment_count} payments</div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right align-top whitespace-nowrap">
                    {inv.refundable_minor > 0 ? (
                      formatMoney(inv.refundable_minor, inv.currency)
                    ) : (
                      <span className="text-ink-soft">–</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={statusTone(inv.status)}>{humanize(inv.status)}</Badge>
                      {inv.flags.map((f) =>
                        FLAG_LABELS[f] ? (
                          <Badge key={f} tone={FLAG_LABELS[f].tone}>
                            {FLAG_LABELS[f].label}
                          </Badge>
                        ) : null,
                      )}
                    </div>
                    {duplicate && canRefund && inv.refundable_minor > 0 && (
                      <div className="mt-2">
                        <ActionButton
                          disabled={busy}
                          onClick={() => send(`Prepare a refund for the duplicate payment on ${inv.invoice_number}.`)}
                        >
                          Prepare refund
                        </ActionButton>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}