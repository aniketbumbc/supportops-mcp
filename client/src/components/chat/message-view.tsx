import type { UIMessage } from 'ai';
import { Markdown } from './markdown';
import { ToolStatus } from './tool-status';

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
    <div className="space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === 'text') return part.text ? <Markdown key={i} text={part.text} /> : null;
        if (part.type === 'dynamic-tool') return <ToolStatus key={part.toolCallId} part={part} />;
        return null;
      })}
    </div>
  );
}