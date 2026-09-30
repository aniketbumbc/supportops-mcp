'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { Composer } from './composer';
import { MessageView } from './message-view';
import { ChatActionsProvider } from '@/components/cards/chat-actions';

interface Props {
  firstName: string;
  suggestions: string[];
  canRefund: boolean;

}

/** Reads { error: { message } } from our route's JSON errors; the transport puts the body in the message. */
function friendlyError(error: Error & { statusCode?: number }): string {
  try {
    const body = JSON.parse(error.message) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    /* not JSON */
  }
  return 'Something went wrong. Try again.';
}

export function Chat({ firstName, suggestions, canRefund }: Props) {
  const router = useRouter();
  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({ api: '/api/chat' }), []);
  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat({ transport });
  const busy = status === 'submitted' || status === 'streaming';
  const endRef = useRef<HTMLDivElement>(null);

  // Session ended while chatting → back to login.
  useEffect(() => {
    if ((error as { statusCode?: number } | undefined)?.statusCode === 401) {
      router.push('/login?reason=expired&next=/chat');
    }
  }, [error, router]);

  // Keep the newest content in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  const send = (text: string) => {
    if (error) clearError();
    void sendMessage({ text });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 lg:px-6">
      <div className="flex-1 space-y-6 py-8" aria-live="polite">
        {messages.length === 0 ? (
          <div className="pt-10">
            <h2 className="text-2xl font-semibold tracking-tight">What can I help with, {firstName}?</h2>
            <p className="mt-2 text-[15px] text-ink-soft">
              I can look up customers, invoices and tickets, and prepare refunds for you to confirm.
            </p>
            <ul className="mt-8 grid gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    className="h-full w-full rounded-lg border border-rule px-4 py-3 text-left text-sm hover:border-ledger/40 hover:bg-ledger-tint focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ChatActionsProvider value={{ send, busy, canRefund }}>
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
        </ChatActionsProvider>
        )}

        {status === 'submitted' && (
          <p className="text-sm text-ink-soft" role="status">
            Thinking…
          </p>
        )}

        {error && (error as { statusCode?: number }).statusCode !== 401 && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-md bg-danger-tint px-4 py-3 text-sm text-danger">
            <span>{friendlyError(error)}</span>
            <button
              type="button"
              onClick={() => {
                clearError();
                void regenerate();
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-danger/30 px-2.5 py-1 font-medium hover:bg-surface focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:outline-none"
            >
              <RotateCcw size={14} /> Try again
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-surface from-70% to-surface/0 pt-6 pb-4">
        <Composer busy={busy} onSend={send} onStop={() => void stop()} />
        <p className="mt-2 text-center text-xs text-ink-soft">
          Refunds always need your confirmation. The assistant can make mistakes; check important details.
        </p>
      </div>
      <div ref={endRef} className="scroll-mb-36" />

    </div>
  );
}