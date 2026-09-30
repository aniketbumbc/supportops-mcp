'use client';

import { useState, useTransition } from 'react';
import { revokeTokenAction } from '@/app/actions/tokens';
import { Badge } from '@/components/cards/cardui';
import type { PersonalAccessToken } from '@/lib/api/auth';
import { formatDate, humanize } from '@/lib/format';

function lastUsed(iso: string | null): string {
  if (!iso) return 'Never used';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 2) return 'Used just now';
  if (mins < 60) return `Used ${mins} min ago`;
  if (mins < 48 * 60) return `Used ${Math.round(mins / 60)} h ago`;
  return `Used ${formatDate(iso)}`;
}

function Row({ pat }: { pat: PersonalAccessToken }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const revoke = () =>
    startTransition(async () => {
      const result = await revokeTokenAction(pat.id);
      if (!result.ok) setError(result.message);
      setConfirming(false);
    });

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{pat.name}</span>
          <code className="font-mono text-xs text-ink-soft">
            {pat.tokenHint.startsWith('…') ? pat.tokenHint : `…${pat.tokenHint}`}
          </code>
          <Badge tone={pat.status === 'active' ? 'good' : pat.status === 'revoked' ? 'bad' : 'neutral'}>
            {humanize(pat.status)}
          </Badge>
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {pat.status === 'revoked'
            ? `Revoked ${formatDate(pat.revokedAt)}`
            : `${lastUsed(pat.lastUsedAt)} · ${pat.status === 'expired' ? 'expired' : 'expires'} ${formatDate(pat.expiresAt)}`}
          {' · '}created {formatDate(pat.createdAt)}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>

      {pat.status === 'active' &&
        (confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-soft">Stop this token working now?</span>
            <button
              type="button"
              onClick={revoke}
              disabled={pending}
              className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-60"
            >
              {pending ? 'Revoking…' : 'Revoke'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-md border border-rule px-3 py-1.5 text-sm hover:bg-ink/5"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-rule px-3 py-1.5 text-sm text-danger hover:bg-danger-tint focus-visible:ring-2 focus-visible:ring-danger/30 focus-visible:outline-none"
          >
            Revoke…
          </button>
        ))}
    </li>
  );
}

export function TokenList({ tokens }: { tokens: PersonalAccessToken[] }) {
  const active = tokens.filter((t) => t.status === 'active');
  const inactive = tokens.filter((t) => t.status !== 'active');
  if (tokens.length === 0) return <p className="text-sm text-ink-soft">No tokens yet.</p>;
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-medium">Active ({active.length})</h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No active tokens.</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule rounded-lg border border-rule bg-white">
            {active.map((t) => (
              <Row key={t.id} pat={t} />
            ))}
          </ul>
        )}
      </section>
      {inactive.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-ink-soft">Revoked and expired</h2>
          <ul className="mt-2 divide-y divide-rule rounded-lg border border-rule bg-white opacity-80">
            {inactive.map((t) => (
              <Row key={t.id} pat={t} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}