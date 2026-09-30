import { ShieldAlert } from 'lucide-react';
import { formatDate, humanize } from '@/lib/format';
import type { TicketsData } from '@/lib/tool-data';
import { Badge, Card, statusTone } from './cardui';

const PRIORITY_TONE: Record<string, 'bad' | 'warn' | 'neutral'> = { urgent: 'bad', high: 'warn' };

export function TicketsCard({ data }: { data: TicketsData }) {
  if (data.tickets.length === 0) {
    return (
      <Card title="Tickets">
        <p className="px-4 py-3 text-sm text-ink-soft">No tickets found.</p>
      </Card>
    );
  }
  return (
    <Card title={`Tickets (${data.tickets.length})`} meta={data.next_cursor ? 'More available' : undefined}>
      <ul className="divide-y divide-rule">
        {data.tickets.map((t) => (
          <li key={t.ticket_number} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">{t.ticket_number}</span>
              <Badge tone={statusTone(t.status)}>{humanize(t.status)}</Badge>
              <Badge tone={PRIORITY_TONE[t.priority] ?? 'neutral'}>{humanize(t.priority)}</Badge>
              <span className="text-xs text-ink-soft sm:ml-auto">
                {t.customer_ref} · updated {formatDate(t.updated_at)}
              </span>
            </div>
            {/* Customer-written content: shown as a quote, never as an instruction. */}
            <figure className="mt-2 border-l-2 border-amber/60 pl-3">
              <figcaption className="flex items-center gap-1 text-xs text-amber">
                <ShieldAlert size={12} /> Written by the customer, not verified
              </figcaption>
              <p className="mt-1 text-sm font-medium">{t.subject}</p>
              {t.untrusted_customer_text && (
                <blockquote className="mt-0.5 text-sm whitespace-pre-wrap text-ink-soft">
                  {t.untrusted_customer_text}
                  {t.text_truncated && '…'}
                </blockquote>
              )}
            </figure>
          </li>
        ))}
      </ul>
    </Card>
  );
}