import Link from 'next/link';
import { AuditTable } from '@/components/audit/audit-table';
import { PageHeader } from '@/components/shell/page-header';
import { ApiError, AUDIT_OUTCOMES, listAudit, type AuditFilters } from '@/lib/api';
import { humanize } from '@/lib/format';
import { TOOL_LABELS } from '@/lib/tool-labels';
import { getSessionToken, requireRole } from '@/lib/session';

const FILTER_KEYS = ['user', 'tool', 'outcome', 'source', 'from', 'to', 'correlation_id'] as const;

const field =
  'mt-1 block w-full rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-ledger focus:ring-3 focus:ring-ledger/15';

export const metadata = { title: 'Audit' };

export default async function AuditPage({ searchParams }: PageProps<'/audit'>) {
  await requireRole('admin');
  const params = await searchParams;
  const filters: AuditFilters = {};
  for (const key of [...FILTER_KEYS, 'before'] as const) {
    const v = params[key];
    if (typeof v === 'string' && v.trim()) filters[key] = v.trim();
  }

  let result: Awaited<ReturnType<typeof listAudit>> | null = null;
  let error: string | null = null;
  try {
    result = await listAudit((await getSessionToken())!, filters);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    error = e.message;
  }

  // Page links keep the current filters.
  const hrefWith = (before?: number) => {
    const qs = new URLSearchParams();
    for (const key of FILTER_KEYS) if (filters[key]) qs.set(key, filters[key]!);
    if (before) qs.set('before', String(before));
    const s = qs.toString();
    return s ? `/audit?${s}` : '/audit';
  };
  const filtered = FILTER_KEYS.some((k) => filters[k]);

  return (
    <>
      <PageHeader title="Audit log" description="Every tool call: who made it, from where, and what happened." />
      <div className="space-y-5 px-6 py-6 lg:px-10">
        {/* A GET form: every filtered view is a shareable URL. */}
        <form method="get" className="grid gap-3 rounded-lg border border-rule bg-surface p-4 sm:grid-cols-3 lg:grid-cols-7">
          <label className="text-xs text-ink-soft lg:col-span-2">
            User (name or email)
            <input name="user" defaultValue={filters.user} className={field} />
          </label>
          <label className="text-xs text-ink-soft">
            Tool
            <select name="tool" defaultValue={filters.tool ?? ''} className={field}>
              <option value="">Any</option>
              {Object.keys(TOOL_LABELS).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-soft">
            Outcome
            <select name="outcome" defaultValue={filters.outcome ?? ''} className={field}>
              <option value="">Any</option>
              {AUDIT_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {humanize(o)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-soft">
            Source
            <select name="source" defaultValue={filters.source ?? ''} className={field}>
              <option value="">Any</option>
              <option value="web">Web app</option>
              <option value="pat">Access tokens</option>
            </select>
          </label>
          <label className="text-xs text-ink-soft">
            From
            <input type="date" name="from" defaultValue={filters.from} className={field} />
          </label>
          <label className="text-xs text-ink-soft">
            To
            <input type="date" name="to" defaultValue={filters.to} className={field} />
          </label>
          <label className="text-xs text-ink-soft sm:col-span-2 lg:col-span-4">
            Correlation ID
            <input name="correlation_id" defaultValue={filters.correlation_id} placeholder="req_…" className={field} />
          </label>
          <div className="flex items-end gap-2 sm:col-span-1 lg:col-span-3">
            <button type="submit" className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-paper hover:bg-ink-soft">
              Filter
            </button>
            {filtered && (
              <Link href="/audit" className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-ink/5">
                Clear
              </Link>
            )}
          </div>
        </form>

        {error && (
          <p role="alert" className="rounded-md bg-danger-tint px-3 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        {result && result.entries.length === 0 && (
          <p className="text-sm text-ink-soft">
            {filtered ? 'No calls match these filters.' : 'No tool calls recorded yet.'}
          </p>
        )}

        {result && result.entries.length > 0 && (
          <>
            <AuditTable entries={result.entries} />
            <div className="flex items-center gap-3 text-sm">
              {filters.before && (
                <Link href={hrefWith()} className="text-ledger underline">
                  Newest
                </Link>
              )}
              {result.nextCursor && (
                <Link href={hrefWith(result.nextCursor)} className="text-ledger underline">
                  Older entries →
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}