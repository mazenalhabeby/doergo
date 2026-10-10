"use client"

import { createContext, useContext } from "react"

/*
  The chat's imperative API, on its own.

  `useChat` used to be exported from chat-drawer.tsx, so every page with a
  "Message" button (the task page's progress card, the contact actions) pulled
  the whole drawer into its bundle — socket.io-client, the drawer UI and its
  queries — although the drawer is mounted once, by the dashboard layout.
*/
export interface ChatContextValue {
  openMessages: () => void;
  openChatWith: (userId: string) => void;
  /**
   * Can a conversation with this person be opened at all?
   *
   * Ask before rendering a Message button. Chat is between two people, so
   * there is no conversation with yourself and none with nobody — and a button
   * for either is a button that does nothing when pressed. That kept happening
   * because each screen re-derived the rule, or forgot to: the task card
   * offered a member a Message button pointing at themselves, and the employee
   * panel did the same on your own card. One definition, so a screen can ask
   * instead of guess.
   */
  canMessage: (userId?: string | null) => boolean;
  unread: number;
}
export const ChatContext = createContext<ChatContextValue>({
  openMessages: () => {},
  openChatWith: () => {},
  canMessage: () => false,
  unread: 0,
});
export function useChat() {
  return useContext(ChatContext);
}

