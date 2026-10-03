import { Badge } from '@/components/cards/cardui';
import { DEMO_USER_EMAIL } from '@/lib/api';
import type { AuditEntry } from '@/lib/api/audit';
import { humanize } from '@/lib/format';

const OUTCOME_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
  success: 'good',
  pending_approval: 'warn',
  rate_limited: 'warn',
  denied: 'bad',
  error: 'bad',
  cancelled: 'neutral',
};

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** One row per tool call; click a row to see its (redacted) arguments and result. */
export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[180px_1.2fr_1.3fr_130px_1fr_80px] gap-3 border-b border-rule bg-paper/60 px-4 py-2 text-xs text-ink-soft">
          <span>Time</span>
          <span>Who</span>
          <span>Tool</span>
          <span>Outcome</span>
          <span>Source</span>
          <span className="text-right">Time taken</span>
        </div>
        <ul className="divide-y divide-rule">
          {entries.map((e) => (
            <li key={e.id}>
              <details className="group">
                <summary className="grid cursor-pointer list-none grid-cols-[180px_1.2fr_1.3fr_130px_1fr_80px] items-center gap-3 px-4 py-2.5 text-sm hover:bg-ink/[0.02] focus-visible:bg-ledger-tint focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  <span className="whitespace-nowrap text-ink-soft">{time(e.occurredAt)}</span>
                  <span
                    className="truncate"
                    // The demo account's email stays off screen.
                    title={e.userEmail === DEMO_USER_EMAIL ? (e.userName ?? undefined) : (e.userEmail ?? e.userId)}
                  >
                    {e.userName ?? e.userId}
                  </span>
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="font-mono text-[13px]">{e.toolName}</span>
                    {e.actionType === 'write' && <Badge>write</Badge>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    <Badge tone={OUTCOME_TONE[e.outcome] ?? 'neutral'}>{humanize(e.outcome)}</Badge>
                  </span>
                  <span className="truncate text-ink-soft">
                    {e.authMethod === 'pat' ? `Token: ${e.tokenName ?? 'unnamed'}` : 'Web app'}
                  </span>
                  <span className="text-right text-ink-soft">{e.durationMs} ms</span>
                </summary>
                <div className="grid gap-4 border-t border-rule bg-paper/40 px-4 py-3 text-sm md:grid-cols-2">
                  <dl className="space-y-1.5 md:col-span-2">
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      <span>
                        <span className="text-ink-soft">Roles:</span> {e.roles.map(humanize).join(', ')}
                      </span>
                      {e.errorCode && (
                        <span>
                          <span className="text-ink-soft">Error:</span>{' '}
                          <code className="font-mono text-xs">{e.errorCode}</code>
                        </span>
                      )}
                      <span>
                        <span className="text-ink-soft">Correlation ID:</span>{' '}
                        <code className="font-mono text-xs">{e.correlationId}</code>
                      </span>
                    </div>
                  </dl>
                  <div>
                    <p className="text-xs text-ink-soft">Arguments (secrets redacted)</p>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-surface p-2 font-mono text-xs">
                      {json(e.arguments)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs text-ink-soft">Result summary</p>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-surface p-2 font-mono text-xs">
                      {e.resultSummary ? json(e.resultSummary) : '–'}
                    </pre>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}