'use client';

import { useState } from 'react';
import type { Approval } from '@/lib/api/approvals';
import { ApprovalItem } from './approvals-item';

/**
 * The list keeps items decided during this visit visible (with their outcome), even
 * after the page refreshes and they no longer match the "Pending" filter. Otherwise
 * an approver would click Approve and see the item simply disappear.
 */
interface Props {
  approvals: Approval[];
  currentUserId: string;
  emptyText: string;
}

export function ApprovalsList({ approvals, currentUserId, emptyText }: Props) {
  const [decided, setDecided] = useState<Record<string, Approval>>({});

  const byRef = new Map(approvals.map((a) => [a.approvalRef, a]));
  for (const [ref, a] of Object.entries(decided)) byRef.set(ref, a);
  const items = [...byRef.values()].sort((x, y) => Date.parse(y.requestedAt) - Date.parse(x.requestedAt));

  if (items.length === 0) return <p className="mt-10 text-sm text-ink-soft">{emptyText}</p>;

  return (
    <ul className="mt-5 max-w-3xl space-y-3">
      {items.map((a) => (
        <ApprovalItem
          key={a.approvalRef}
          approval={a}
          currentUserId={currentUserId}
          onDecided={(updated) => setDecided((d) => ({ ...d, [updated.approvalRef]: updated }))}
        />
      ))}
    </ul>
  );
}