'use client';

import { AlertTriangle, KeyRound, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { createTokenAction } from '@/app/actions/tokens';
import { CopyButton } from './copy-button';

const DAYS = [7, 30, 60, 90] as const;

/** Create a token; show it once with ready-to-paste client setup. */
export function TokenCreator({ mcpUrl }: { mcpUrl: string }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<(typeof DAYS)[number]>(30);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const [tab, setTab] = useState<'cursor' | 'claude'>('cursor');
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await createTokenAction(name, days);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCreated({ token: result.token, name: result.pat.name });
      setName('');
    });

  if (created) {
    const serverName = 'supportops';
    const cursorConfig = JSON.stringify(
      { mcpServers: { [serverName]: { url: mcpUrl, headers: { Authorization: `Bearer ${created.token}` } } } },
      null,
      2,
    );
    const claudeCommand = `claude mcp add --transport http ${serverName} ${mcpUrl} \\\n  --header "Authorization: Bearer ${created.token}"`;
    const snippet = tab === 'cursor' ? cursorConfig : claudeCommand;

    return (
      <section className="rounded-lg border border-ledger/40 bg-white shadow-[0_8px_24px_-12px_rgba(31,111,92,0.35)]">
        <header className="border-b border-rule px-4 py-3">
          <h2 className="flex items-center gap-2 font-medium">
            <KeyRound size={16} className="text-ledger" /> “{created.name}” is ready
          </h2>
        </header>
        <div className="space-y-4 px-4 py-4">
          <p className="flex items-start gap-2 rounded-md bg-amber-tint px-3 py-2.5 text-sm text-amber">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            Copy it now. This is the only time the token is shown; it works like your password for these tools.
          </p>

          <div>
            <p className="text-sm font-medium">Token</p>
            <div className="mt-1.5 flex items-center gap-2 rounded-md border border-rule bg-paper px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs" aria-label="Token">
                {created.token}
              </code>
              <CopyButton text={created.token} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <div role="tablist" aria-label="Client" className="flex gap-1">
                {(['cursor', 'claude'] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    type="button"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`rounded-md px-2.5 py-1 text-sm ${tab === t ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5'}`}
                  >
                    {t === 'cursor' ? 'Cursor' : 'Claude Code'}
                  </button>
                ))}
              </div>
              <CopyButton text={snippet} label={tab === 'cursor' ? 'Copy config' : 'Copy command'} />
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              {tab === 'cursor'
                ? 'Add this to .cursor/mcp.json (or ~/.cursor/mcp.json), then enable "supportops" in Cursor Settings → MCP.'
                : 'Run this in a terminal. Claude Code will then offer the SupportOps tools.'}
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-ink p-3 font-mono text-xs leading-relaxed text-paper">
              {snippet}
            </pre>
          </div>

          <button
            type="button"
            onClick={() => setCreated(null)}
            className="rounded-md border border-rule px-3.5 py-1.5 text-sm hover:bg-ink/5"
          >
            Done, I’ve copied it
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="rounded-lg border border-rule bg-white px-4 py-4"
    >
      <h2 className="font-medium">Create a token</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Tokens connect tools like Cursor or Claude Code to SupportOps. They act with your role, and every action is
        recorded under the token’s name.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="token-name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="e.g. Cursor on my laptop"
            className="mt-1.5 block w-full rounded-md border border-rule px-3 py-2 text-sm outline-none focus:border-ledger focus:ring-3 focus:ring-ledger/15"
          />
        </div>
        <div>
          <label htmlFor="token-days" className="text-sm font-medium">
            Expires after
          </label>
          <select
            id="token-days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) as (typeof DAYS)[number])}
            className="mt-1.5 block rounded-md border border-rule bg-white px-3 py-2 text-sm outline-none focus:border-ledger focus:ring-3 focus:ring-ledger/15"
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="flex items-center gap-2 rounded-md bg-ledger px-4 py-2 text-sm font-medium text-white hover:bg-ledger-dark focus-visible:ring-3 focus-visible:ring-ledger/40 focus-visible:outline-none disabled:opacity-60"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Create token
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}