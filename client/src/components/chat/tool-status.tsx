import { AlertTriangle, Check, Loader2, XCircle } from 'lucide-react';
import type { DynamicToolUIPart } from 'ai';
import { toolLabel } from '@/lib/tool-labels';

/** Mirrors AgentToolOutput from lib/agent/tools.ts (kept import-free: that file is server-only). */
type Output =
  | { ok: true; summary: string; data: Record<string, unknown> | null }
  | { ok: false; error: { code: string; message: string } };

/** A compact line showing what a tool is doing / did. Step 9 adds rich cards for results. */
export function ToolStatus({ part }: { part: DynamicToolUIPart }) {
  const base = 'flex items-start gap-2 rounded-md px-3 py-2 text-sm';

  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return (
      <div className={`${base} bg-ink/[0.03] text-ink-soft`} role="status">
        <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin" />
        <span>{toolLabel(part.toolName, 'running')}…</span>
      </div>
    );
  }

  if (part.state === 'output-error') {
    return (
      <div className={`${base} bg-danger-tint text-danger`}>
        <XCircle size={15} className="mt-0.5 shrink-0" />
        <span>Couldn’t complete: {part.errorText}</span>
      </div>
    );
  }

  const output = part.output as Output | undefined;
  if (output && !output.ok) {
    return (
      <div className={`${base} bg-amber-tint text-amber`}>
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>{output.error.message}</span>
      </div>
    );
  }

  return (
    <div className={`${base} text-ink-soft`}>
      <Check size={15} className="mt-0.5 shrink-0 text-ledger" />
      <span>
        {toolLabel(part.toolName, 'done')}
        {output?.summary ? <span className="text-ink"> · {output.summary}</span> : null}
      </span>
    </div>
  );
}