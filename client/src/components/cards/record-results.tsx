'use client';

import { Info } from 'lucide-react';
import { humanize } from '@/lib/format';
import type {
  CreatedCustomerData,
  CreatedTicketData,
  UpdatedCustomerData,
  UpdatedTicketData,
} from '@/lib/tool-data';
import { useChatActions } from './chat-actions';
import { ActionButton, Badge, Card, statusTone } from './cardui';

function Changes({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="px-4 py-3 text-sm text-ink-soft">Nothing needed changing.</p>;
  return (
    <ul className="space-y-1 px-4 py-3 text-sm">
      {items.map((c) => (
        <li key={c} className="flex gap-2">
          <span className="text-ledger">→</span>
          {c}
        </li>
      ))}
    </ul>
  );
}

const Replayed = () => (
  <p className="flex items-center gap-1.5 border-t border-rule px-4 py-2 text-xs text-ink-soft">
    <Info size={12} /> Already done earlier; nothing was changed twice.
  </p>
);

export function CreatedTicketCard({ data }: { data: CreatedTicketData }) {
  return (
    <Card title={`Ticket ${data.ticket_number} created`} meta={data.customer_ref}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
        <span className="font-medium">{data.subject}</span>
        <Badge tone={statusTone(data.status)}>{humanize(data.status)}</Badge>
        <Badge>{humanize(data.priority)}</Badge>
        <Badge>{humanize(data.category)}</Badge>
        {data.related_invoice_number && <span className="text-ink-soft">· {data.related_invoice_number}</span>}
      </div>
      {data.priority_adjusted && (
        <p className="border-t border-rule bg-amber-tint px-4 py-2 text-sm text-amber">
          Set to {data.priority_adjusted.applied} instead of {data.priority_adjusted.requested}: only leads can
          mark tickets urgent.
        </p>
      )}
      {data.replayed && <Replayed />}
    </Card>
  );
}

export function UpdatedTicketCard({ data }: { data: UpdatedTicketData }) {
  return (
    <Card
      title={`Ticket ${data.ticket_number} updated`}
      meta={
        <span className="flex gap-1.5">
          <Badge tone={statusTone(data.status)}>{humanize(data.status)}</Badge>
          <Badge>{humanize(data.priority)}</Badge>
        </span>
      }
    >
      <Changes items={data.changes_applied} />
      {data.replayed && <Replayed />}
    </Card>
  );
}

export function CreatedCustomerCard({ data }: { data: CreatedCustomerData }) {
  const { send, busy } = useChatActions();
  if (data.status === 'possible_duplicates_found') {
    const first = data.possible_duplicates[0]!;
    return (
      <Card title="Not created: similar customers exist" meta="Is it one of these?">
        <ul className="divide-y divide-rule">
          {data.possible_duplicates.map((d) => (
            <li key={d.customer_ref} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="font-medium">{d.name}</span>
              <span className="text-ink-soft">{d.customer_ref}</span>
              <Badge tone="warn">{humanize(d.reason)}</Badge>
              <span className="text-ink-soft sm:ml-auto">{d.primary_email}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-rule px-4 py-3">
          <ActionButton disabled={busy} onClick={() => send("It's a new customer, not one of these. Create it.")}>
            It’s a new customer
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() => send(`Don't create it; it's ${first.name} (${first.customer_ref}).`)}
          >
            Use {first.name}
          </ActionButton>
        </div>
      </Card>
    );
  }
  return (
    <Card title={`Customer ${data.customer_ref} created`}>
      <p className="px-4 py-3 text-sm font-medium">{data.name}</p>
      {data.replayed && <Replayed />}
    </Card>
  );
}

export function UpdatedCustomerCard({ data }: { data: UpdatedCustomerData }) {
  return (
    <Card
      title={`${data.customer.name} · ${data.customer_ref} updated`}
      meta={
        <span className="flex gap-1.5">
          <Badge>{humanize(data.customer.tier)}</Badge>
          <Badge tone={statusTone(data.customer.status)}>{humanize(data.customer.status)}</Badge>
        </span>
      }
    >
      <Changes items={data.changes_applied} />
      {data.replayed && <Replayed />}
    </Card>
  );
}