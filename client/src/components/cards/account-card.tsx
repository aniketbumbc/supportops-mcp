import { AlertTriangle } from 'lucide-react';
import { formatDate, formatMoney, humanize } from '@/lib/format';
import type { AccountData } from '@/lib/tool-data';
import { Badge, Card, Field, statusTone } from './cardui';

export function AccountCard({ data }: { data: AccountData }) {
  return (
    <Card
      title={`${data.name} · ${data.customer_ref}`}
      meta={
        <span className="flex gap-1.5">
          <Badge>{humanize(data.tier)}</Badge>
          <Badge tone={statusTone(data.status)}>{humanize(data.status)}</Badge>
        </span>
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-4">
        <Field label="Balance due">
          {data.balance ? (
            <span className={data.balance.amount_due_minor > 0 ? 'font-semibold text-danger' : ''}>
              {formatMoney(data.balance.amount_due_minor, data.balance.currency)}
            </span>
          ) : (
            '–'
          )}
        </Field>
        <Field label="Open invoices">{data.balance?.open_invoices ?? '–'}</Field>
        <Field label="Open tickets">{data.support?.open_tickets ?? '–'}</Field>
        <Field label="Customer since">{formatDate(data.customer_since)}</Field>
        {data.primary_contact && (
          <div className="col-span-2 sm:col-span-4">
            <Field label="Primary contact">
              {data.primary_contact.name}, {data.primary_contact.role} · {data.primary_contact.email}
            </Field>
          </div>
        )}
      </dl>

      {data.subscriptions && data.subscriptions.length > 0 && (
        <div className="border-t border-rule px-4 py-3">
          <p className="text-xs text-ink-soft">Subscriptions</p>
          <ul className="mt-1.5 space-y-1.5">
            {data.subscriptions.map((s) => (
              <li key={s.subscription_ref} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{s.plan}</span>
                <Badge tone={statusTone(s.status)}>{humanize(s.status)}</Badge>
                <span className="text-ink-soft">
                  {formatMoney(s.amount_minor, s.currency)} / {s.billing_cycle === 'annual' ? 'year' : 'month'}
                </span>
                {s.renews_at && <span className="text-ink-soft sm:ml-auto">Renews {formatDate(s.renews_at)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.unavailable_sections.length > 0 && (
        <p className="flex items-center gap-2 border-t border-rule bg-amber-tint px-4 py-2 text-sm text-amber">
          <AlertTriangle size={14} /> Not available right now: {data.unavailable_sections.join(', ')}.
        </p>
      )}
    </Card>
  );
}