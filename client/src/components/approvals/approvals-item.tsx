'use client';

import { CheckCircle2, Clock, Lock, XCircle } from 'lucide-react';
import { useState, useTransition } from 'react';
import { approveAction, rejectAction } from '@/app/actions/approvals';
import { Badge, statusTone } from '@/components/cards/cardui';
import type { Approval } from '@/lib/api/approvals';
import { formatDate, formatMoney, humanize } from '@/lib/format';

const REASON_LABELS: Record<string, string> = {
  above_direct_limit: 'Above requester’s direct limit',
  outside_refund_window: 'Outside the refund window',
};

function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}h left` : `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

type Mode = 'idle' | 'approve' | 'reject';

interface Props {
  approval: Approval;
  currentUserId: string;
  /** Called with the updated request after approving or rejecting it. */
  onDecided: (approval: Approval) => void;
}

export function ApprovalItem({ approval: initial, currentUserId, onDecided }: Props) {
  const [a, setA] = useState(initial);
  const [mode, setMode] = useState<Mode>('idle');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amount = formatMoney(a.amountMinor, a.currency);
  const who = (id: string | null, name: string | null) =>
    id === currentUserId ? 'you' : (name ?? 'another user');

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result =
        mode === 'approve' ? await approveAction(a.approvalRef, note) : await rejectAction(a.approvalRef, note);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setA(result.approval);
      onDecided(result.approval);
      setMode('idle');
      setNote('');
    });

  return (
    <li className="rounded-lg border border-rule bg-white">
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{a.approvalRef}</span>
            <Badge tone={a.status === 'executed' ? 'good' : a.status === 'rejected' ? 'bad' : statusTone(a.status)}>
              {humanize(a.status)}
            </Badge>
            {a.approvalReasons.map((r) => (
              <Badge key={r} tone="warn">
                {REASON_LABELS[r] ?? humanize(r)}
              </Badge>
            ))}
          </div>
          <p className="mt-1.5 text-sm">
            {a.customerRef} · {a.invoiceNumber}
            {a.relatedTicketNumber && <> · {a.relatedTicketNumber}</>} · {humanize(a.reason)}
          </p>
          <p className="mt-1 text-sm text-ink-soft">“{a.note}”</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
            <span>
              Requested by {who(a.requestedBy, a.requestedByName)} on {formatDate(a.requestedAt)}
            </span>
            {a.status === 'pending' && (
              <span className="flex items-center gap-1">
                <Clock size={11} /> {timeLeft(a.expiresAt)}
              </span>
            )}
          </p>
        </div>
        <p className="text-2xl font-semibold tracking-tight sm:text-right">{amount}</p>
      </div>

      <div className="border-t border-rule px-4 py-3">
        {/* Decided */}
        {a.status === 'executed' && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-ledger">
            <CheckCircle2 size={15} /> Approved by {who(a.decidedBy, a.decidedByName)} · refunded as{' '}
            <span className="font-medium">{a.refundRef}</span>
            {a.decisionNote && <span className="text-ink-soft">· “{a.decisionNote}”</span>}
          </p>
        )}
        {a.status === 'rejected' && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-danger">
            <XCircle size={15} /> Rejected by {who(a.decidedBy, a.decidedByName)}
            {a.decisionNote && <span className="text-ink-soft">· “{a.decisionNote}”</span>}
          </p>
        )}
        {a.status === 'approved' && (
          <p className="text-sm text-amber">
            Approved by {who(a.decidedBy, a.decidedByName)}, but the refund didn’t complete.
            {a.decisionNote && ` ${a.decisionNote}`}
          </p>
        )}
        {a.status === 'expired' && (
          <p className="text-sm text-ink-soft">Expired without a decision. Nothing was refunded.</p>
        )}

        {/* Pending, but this user can't decide it: say why */}
        {a.status === 'pending' && !a.canDecide && (
          <p className="flex items-center gap-1.5 text-sm text-ink-soft">
            <Lock size={14} /> {a.cannotDecideReason}
          </p>
        )}

        {/* Pending and decidable */}
        {a.status === 'pending' && a.canDecide && mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode('approve')}
              className="rounded-md bg-ledger px-3.5 py-1.5 text-sm font-medium text-white hover:bg-ledger-dark focus-visible:ring-3 focus-visible:ring-ledger/40 focus-visible:outline-none"
            >
              Approve…
            </button>
            <button
              type="button"
              onClick={() => setMode('reject')}
              className="rounded-md border border-rule px-3.5 py-1.5 text-sm hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
            >
              Reject…
            </button>
          </div>
        )}

        {a.status === 'pending' && a.canDecide && mode !== 'idle' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-2.5"
          >
            <label htmlFor={`note-${a.approvalRef}`} className="text-sm font-medium">
              {mode === 'approve' ? 'Note (optional)' : 'Why are you rejecting it?'}
            </label>
            <textarea
              id={`note-${a.approvalRef}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              autoFocus
              required={mode === 'reject'}
              className="block w-full rounded-md border border-rule px-3 py-2 text-sm outline-none focus:border-ledger focus:ring-3 focus:ring-ledger/15"
            />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pending || (mode === 'reject' && note.trim().length < 5)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${
                  mode === 'approve' ? 'bg-ledger hover:bg-ledger-dark' : 'bg-danger hover:bg-danger/90'
                }`}
              >
                {pending
                  ? mode === 'approve'
                    ? 'Approving and refunding…'
                    : 'Rejecting…'
                  : mode === 'approve'
                    ? `Approve and refund ${amount}`
                    : 'Reject request'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMode('idle');
                  setError(null);
                }}
                className="rounded-md border border-rule px-3.5 py-1.5 text-sm hover:bg-ink/5"
              >
                Back
              </button>
            </div>
          </form>
        )}

        {error && mode === 'idle' && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}