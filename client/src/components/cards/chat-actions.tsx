'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Lets cards continue the conversation (e.g. "pick this customer", "prepare refund").
 * A card action just sends a normal chat message, so the AI and every server rule
 * still apply; cards never call tools directly.
 */
interface ChatActions {
  send: (text: string) => void;
  busy: boolean;
  canRefund: boolean;
}

const Ctx = createContext<ChatActions>({ send: () => {}, busy: true, canRefund: false });

export function ChatActionsProvider({ value, children }: { value: ChatActions; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useChatActions = () => useContext(Ctx);