import type { DynamicToolUIPart, UIMessage } from 'ai';
import { ToolResultCard } from '@/components/cards';
import { Markdown } from './markdown';
import { ToolStatus } from './tool-status';

type Output = { ok: true; summary: string; data: Record<string, unknown> | null } | { ok: false };

/** A finished, successful tool result that has a card → the card; anything else → a status line. */
function ToolPart({ part }: { part: DynamicToolUIPart }) {
  if (part.state === 'output-available') {
    const output = part.output as Output;
    if (output.ok && output.data) {
      const card = ToolResultCard({
        toolName: part.toolName,
        data: output.data,
        input: (part.input ?? {}) as Record<string, unknown>,
      });
      if (card) return card;
    }
  }
  return <ToolStatus part={part} />;
}

/** One message: user text as a bubble; assistant text and tool activity in reading order. */
export function MessageView({ message }: { message: UIMessage }) {
  if (message.role === 'user') {
    const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] whitespace-pre-wrap text-paper">
          {text}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message.parts.map((part, i) => {
        if (part.type === 'text') return part.text ? <Markdown key={i} text={part.text} /> : null;
        if (part.type === 'dynamic-tool') return <ToolPart key={part.toolCallId} part={part} />;
        return null;
      })}
    </div>
  );
}