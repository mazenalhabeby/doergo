"use client"

import { useCallback } from "react"
import { useChat } from "@/components/chat/chat-context"

/**
 * Reaching a colleague: message them. (Calls were removed 2026-10-15 — people
 * carry no phone number, so every Call button only said "coming soon".)
 *
 * The same pair of buttons sits on the team page, the workspace card, the
 * employee panel, the management contacts list and the task detail card. Four
 * of them agreed on what the buttons do; the fifth — the task card — went its
 * own way and opened `mailto:` and `tel:` links instead. Those did nothing at
 * all, because the assignee rows it was reading carry no email or phone, so the
 * handlers fell through their own `&&` guard in silence.
 *
 * Behaviour lives here now so there is one answer to "what does Message do",
 * and so one file changes when calling ships. The
 * markup deliberately stays where it is — those five buttons look different on
 * purpose, and a shared component would have to fight each of them.
 */
export function useContactActions() {
  const { openChatWith, canMessage } = useChat()

  /** Open a direct conversation. No contact details required — every colleague
   *  has an account. Ask `canMessage` first: there is no conversation with
   *  yourself, and a Message button that reaches you does nothing. */
  const message = useCallback((userId: string) => openChatWith(userId), [openChatWith])

  return { message, canMessage }
}
