'use client';

import { CheckCircle2, Clock, Hourglass, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { confirmRefundAction } from '@/app/actions/refund';
import { formatMoney, humanize } from '@/lib/format';
import { useChatActions } from './chat-actions';
import { Badge } from './cardui';

/** issue_refund's structured result (docs/tool-contract.md §5.7). */
export interface RefundData {
  status: 'requires_confirmation' | 'completed' | 'pending_approval';
  decision: 'execute' | 'request_approval';
  approval_reasons: string[];
  customer_ref: string;
  invoice_number: string;
  payment_ref: string;
  amount_minor: number;
  currency: string;
  confirmation_token: string | null;
  confirmation_expires_at: string | null;
  refund_ref: string | null;
  approval_ref: string | null;
  ticket_note_added: boolean;
  message: string;
}

type Phase =
  | { kind: 'preview' }
  | { kind: 'working' }
  | { kind: 'done'; data: RefundData }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

const REASON_LABELS: Record<string, string> = {
  above_direct_limit: 'Above your direct refund limit',
  outside_refund_window: 'Outside the refund window',
};

function useSecondsLeft(expiresAt: string | null): number {
  const target = expiresAt ? Date.parse(expiresAt) : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return Math.max(0, Math.round((target - now) / 1000));
}

export function RefundCard({ data, input }: { data: RefundData; input: Record<string, unknown> }) {
  const { send, busy } = useChatActions();
  const [phase, setPhase] = useState<Phase>(
    data.status === 'requires_confirmation' ? { kind: 'preview' } : { kind: 'done', data },
  );
  const [pending, startTransition] = useTransition();
  const secondsLeft = useSecondsLeft(data.confirmation_expires_at);
  const amount = formatMoney(data.amount_minor, data.currency);
  const needsApproval = data.decision === 'request_approval';

  const confirm = () =>
    startTransition(async () => {
      setPhase({ kind: 'working' });
      const result = await confirmRefundAction({
        // What gets refunded comes from the server's preview, not from editable page state.
        customer_ref: data.customer_ref,
        invoice_number: data.invoice_number,
        amount_minor: data.amount_minor,
        reason: String(input.reason ?? ''),
        note: String(input.note ?? ''),
        related_ticket_number:
          typeof input.related_ticket_number === 'string' ? input.related_ticket_number : undefined,
        confirmation_token: data.confirmation_token ?? '',
      });
      if (!result.ok) {
        setPhase({ kind: 'failed', message: result.error.message });
        return;
      }
      const done = result.data as unknown as RefundData;
      setPhase({ kind: 'done', data: done });
      // Keep the assistant's picture accurate for the rest of the conversation.
      
        send(
            done.status === 'completed'
              ? `I confirmed the refund in the card: ${amount} on ${data.invoice_number} (${done.refund_ref}). Please check the invoice record.`
              : `I confirmed the refund request in the card: ${amount} on ${data.invoice_number} is waiting for approval ${done.approval_ref}.`,
          );
      
    });

  const cancel = () => {
    setPhase({ kind: 'cancelled' });
    send(`I cancelled the refund preview for ${amount} on ${data.invoice_number}. Nothing should be refunded.`);
  };

  const expired = phase.kind === 'preview' && secondsLeft === 0;

  return (
    <section
      aria-label="Refund"
      className={`overflow-hidden rounded-lg border bg-white ${
        phase.kind === 'preview'
          ? 'border-ledger/40 shadow-[0_8px_24px_-12px_rgba(31,111,92,0.35)]'
          : 'border-rule'
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-rule bg-paper/60 px-4 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldCheck size={15} className="text-ledger" />
          {phase.kind === 'preview' ? (needsApproval ? 'Refund approval request' : 'Refund preview') : 'Refund'}
        </h3>
        {phase.kind === 'preview' && !expired && (
          <span className="flex items-center gap-1 text-xs text-ink-soft" aria-live="off">
            <Clock size={12} /> Expires in {Math.floor(secondsLeft / 60)}:
            {String(secondsLeft % 60).padStart(2, '0')}
          </span>
        )}
      </header>

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-ink-soft">Customer</dt>
            <dd>{data.customer_ref}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Invoice · payment</dt>
            <dd>
              {data.invoice_number} · {data.payment_ref}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Reason</dt>
            <dd>{humanize(String(input.reason ?? ''))}</dd>
          </div>
          {typeof input.related_ticket_number === 'string' && (
            <div>
              <dt className="text-xs text-ink-soft">Ticket</dt>
              <dd>{input.related_ticket_number}</dd>
            </div>
          )}
          <div className="col-span-2">
            <dt className="text-xs text-ink-soft">Note</dt>
            <dd className="text-ink-soft">{String(input.note ?? '')}</dd>
          </div>
        </dl>
        <div className="sm:text-right">
          <p className="text-xs text-ink-soft">Amount</p>
          <p className="text-3xl font-semibold tracking-tight">{amount}</p>
        </div>
      </div>

      {needsApproval && phase.kind === 'preview' && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-rule bg-amber-tint/60 px-4 py-2.5 text-sm text-amber">
          Needs a second person:
          {data.approval_reasons.map((r) => (
            <Badge key={r} tone="warn">
              {REASON_LABELS[r] ?? humanize(r)}
            </Badge>
          ))}
        </div>
      )}

      <footer className="border-t border-rule px-4 py-3">
        {phase.kind === 'preview' && !expired && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="rounded-md bg-ledger px-4 py-2 text-sm font-medium text-white hover:bg-ledger-dark focus-visible:ring-3 focus-visible:ring-ledger/40 focus-visible:ring-offset-1 focus-visible:outline-none disabled:opacity-60"
            >
              {needsApproval ? `Request approval for ${amount}` : `Confirm refund of ${amount}`}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="rounded-md border border-rule px-4 py-2 text-sm text-ink-soft hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
            >
              Cancel
            </button>
            <span className="text-xs text-ink-soft sm:ml-auto">Nothing happens until you confirm.</span>
          </div>
        )}

        {expired && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft">
            <span>This preview expired. Nothing was refunded.</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => send(`Prepare the ${amount} refund preview for ${data.invoice_number} again.`)}
              className="rounded-md border border-ledger/30 px-3 py-1.5 font-medium text-ledger hover:bg-ledger-tint disabled:opacity-50"
            >
              Get a new preview
            </button>
          </div>
        )}

        {phase.kind === 'working' && (
          <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
            <Loader2 size={15} className="animate-spin" /> {needsApproval ? 'Sending for approval…' : 'Refunding…'}
          </p>
        )}

        {phase.kind === 'cancelled' && <p className="text-sm text-ink-soft">Cancelled. Nothing was refunded.</p>}

        {phase.kind === 'failed' && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-danger" role="alert">
            <span className="flex items-center gap-1.5">
              <XCircle size={15} /> {phase.message}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                send(
                  `The refund for ${data.invoice_number} failed: "${phase.message}". Prepare a new preview if it is still valid.`,
                )
              }
              className="rounded-md border border-danger/30 px-3 py-1.5 font-medium hover:bg-danger-tint disabled:opacity-50"
            >
              Get a new preview
            </button>
          </div>
        )}

        {phase.kind === 'done' && phase.data.status === 'completed' && (
          <p className="flex items-center gap-2 text-sm text-ledger" role="status">
            <CheckCircle2 size={16} /> Refunded {formatMoney(phase.data.amount_minor, phase.data.currency)} ·{' '}
            <span className="font-medium">{phase.data.refund_ref}</span>
            {phase.data.ticket_note_added && <span className="text-ink-soft">· noted on the ticket</span>}
          </p>
        )}

        {phase.kind === 'done' && phase.data.status === 'pending_approval' && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-amber" role="status">
            <Hourglass size={16} /> Approval <span className="font-medium">{phase.data.approval_ref}</span> requested.
            Nothing is refunded until an approver accepts it.
            <Link href="/approvals" className="text-ledger underline">
              View approvals
            </Link>
          </p>
        )}
      </footer>
    </section>
  );
}