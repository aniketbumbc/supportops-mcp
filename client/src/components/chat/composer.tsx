'use client';

import { ArrowUp, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

const MAX_CHARS = 4000;

/** Message box: Enter sends, Shift+Enter adds a line; Stop while the assistant is working. */
export function Composer({ busy, disabled, onSend, onStop }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the content, up to a limit.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const send = () => {
    const value = text.trim();
    if (!value || busy || disabled) return;
    onSend(value);
    setText('');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex items-end gap-2 rounded-xl border border-rule bg-white p-2 shadow-[0_1px_2px_rgba(27,42,58,0.06)] focus-within:border-ledger focus-within:ring-3 focus-within:ring-ledger/15"
    >
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <textarea
        ref={ref}
        id="chat-input"
        rows={1}
        value={text}
        maxLength={MAX_CHARS}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Ask about a customer, invoice, ticket or refund"
        className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-ink-soft/60"
      />
      {busy ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink text-paper hover:bg-ink-soft focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
        >
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim() || disabled}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ledger text-white hover:bg-ledger-dark focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none disabled:bg-rule disabled:text-ink-soft"
        >
          <ArrowUp size={18} />
        </button>
      )}
    </form>
  );
}