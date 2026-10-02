'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { ArrowUpRight, Ban, Hourglass, ReceiptText, RotateCcw, Search, ShieldCheck, Sparkles, Ticket, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { Composer } from './composer';
import { AssistantAvatar, MessageView } from './message-view';
import { ChatActionsProvider } from '@/components/cards/chat-actions';

/** A guided first question: what to ask, and what the user will see happen. */
export interface Suggestion {
  group: 'lookup' | 'refunds' | 'tickets';
  icon: keyof typeof SUGGESTION_ICONS;
  prompt: string;
  hint: string;
}

interface Props {
  firstName: string;
  suggestions: Suggestion[];
  canRefund: boolean;
}

/** Reads { error: { message } } from our route's JSON errors; the transport puts the body in the message. */
const SUGGESTION_ICONS = {
  search: Search,
  user: UserRound,
  refund: ReceiptText,
  blocked: Ban,
  approval: Hourglass,
  ticket: Ticket,
};

const SUGGESTION_GROUPS: { id: Suggestion['group']; title: string }[] = [
  { id: 'lookup', title: 'Look things up' },
  { id: 'refunds', title: 'Refunds & safety rules' },
  { id: 'tickets', title: 'Tickets' },
];

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
          <div className="relative isolate pt-10 sm:pt-16">
            <div
              aria-hidden
              className="absolute -top-10 left-1/2 -z-10 size-96 -translate-x-1/2 rounded-full bg-ledger/10 blur-3xl"
            />
            <div className="flex size-12 items-center justify-center rounded-2xl bg-ledger text-white shadow-[0_8px_24px_-8px_var(--color-ledger)]">
              <Sparkles aria-hidden className="size-6" />
            </div>
            <h2 className="mt-6 text-3xl font-semibold tracking-tight">
              Hi {firstName}, <span className="text-ledger">what can I help with?</span>
            </h2>
            <p className="mt-2 max-w-xl text-[15px] text-ink-soft">
              I can look up customers, invoices and tickets, and prepare refunds for you to confirm.
            </p>
            <p className="mt-10 text-sm font-medium text-ink">New here? Try these in order.</p>
            <div className="mt-4 space-y-6">
              {SUGGESTION_GROUPS.map((g, gi) => {
                const items = suggestions.filter((s) => s.group === g.id);
                if (items.length === 0) return null;
                return (
                  <section key={g.id} aria-labelledby={`suggest-${g.id}`}>
                    <h3
                      id={`suggest-${g.id}`}
                      className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-soft uppercase"
                    >
                      <span className="flex size-5 items-center justify-center rounded-full bg-ledger-tint text-[11px] text-ledger">
                        {gi + 1}
                      </span>
                      {g.title}
                    </h3>
                    <ul className="mt-2.5 grid gap-3 sm:grid-cols-2">
                      {items.map((s) => {
                        const Icon = SUGGESTION_ICONS[s.icon];
                        return (
                          <li key={s.prompt}>
                            <button
                              type="button"
                              onClick={() => send(s.prompt)}
                              className="group flex h-full w-full items-start gap-3 rounded-xl border border-rule bg-surface p-4 text-left text-sm shadow-[0_1px_2px_rgba(27,42,58,0.04)] transition hover:-translate-y-0.5 hover:border-ledger/40 hover:shadow-[0_10px_24px_-14px_rgba(27,42,58,0.35)] focus-visible:ring-2 focus-visible:ring-ledger/40 focus-visible:outline-none"
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ledger-tint text-ledger">
                                <Icon aria-hidden className="size-4" />
                              </span>
                              <span className="flex-1 pt-1">
                                <span className="block leading-snug font-medium text-ink">{s.prompt}</span>
                                <span className="mt-1 block text-xs leading-snug text-ink-soft">{s.hint}</span>
                              </span>
                              <ArrowUpRight
                                aria-hidden
                                className="mt-1.5 size-4 shrink-0 text-ink-soft opacity-0 transition group-hover:opacity-100"
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        ) : (
          <ChatActionsProvider value={{ send, busy, canRefund }}>
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
        </ChatActionsProvider>
        )}

        {status === 'submitted' && (
          <div className="flex items-center gap-3" role="status">
            <AssistantAvatar />
            <span className="flex items-center gap-1 rounded-full bg-ink/[0.04] px-3 py-2" aria-label="Thinking">
              <span className="size-1.5 animate-bounce rounded-full bg-ledger [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-ledger [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-ledger" />
            </span>
          </div>
        )}

        {error && (error as { statusCode?: number }).statusCode !== 401 && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger-tint px-4 py-3 text-sm text-danger">
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

      <div className="sticky bottom-0 bg-linear-to-t from-surface from-70% to-surface/0 pt-6 pb-5">
        <Composer busy={busy} onSend={send} onStop={() => void stop()} />
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-xs text-ink-soft">
          <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-ledger" />
          Refunds always need your confirmation. The assistant can make mistakes; check important details.
        </p>
      </div>
      <div ref={endRef} className="scroll-mb-36" />

    </div>
  );
}