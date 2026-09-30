'use client';

import { humanize } from '@/lib/format';
import type { FindCustomerData } from '@/lib/tool-data';
import { useChatActions } from './chat-actions';
import { Badge, Card, statusTone } from './cardui';

export function CustomerMatchesCard({ data }: { data: FindCustomerData }) {
  const { send, busy } = useChatActions();
  const many = data.matches.length > 1;

  if (data.matches.length === 0) {
    return (
      <Card title="Customers">
        <p className="px-4 py-3 text-sm text-ink-soft">No customers match.</p>
      </Card>
    );
  }

  return (
    <Card
      title={many ? `${data.total_matches} customers match` : 'Customer'}
      meta={many ? 'Choose the right one' : undefined}
    >
      <ul className="divide-y divide-rule">
        {data.matches.map((c) => (
          <li key={c.customer_ref}>
            <button
              type="button"
              disabled={busy || !many}
              onClick={() => send(`Use ${c.name} (${c.customer_ref}).`)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left enabled:hover:bg-ledger-tint/60 focus-visible:bg-ledger-tint focus-visible:outline-none disabled:cursor-default"
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-sm text-ink-soft">{c.customer_ref}</span>
              <span className="flex gap-1.5">
                <Badge>{humanize(c.tier)}</Badge>
                <Badge tone={statusTone(c.status)}>{humanize(c.status)}</Badge>
              </span>
              <span className="w-full text-sm text-ink-soft sm:ml-auto sm:w-auto">
                {c.primary_email} · {c.region}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {data.has_more && (
        <p className="border-t border-rule px-4 py-2 text-xs text-ink-soft">
          More matches exist. Try a more specific name.
        </p>
      )}
    </Card>
  );
}