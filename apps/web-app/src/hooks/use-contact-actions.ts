"use client"

import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import { useChat } from "@/components/chat/chat-drawer"
import { notify } from "@/lib/toast"

/**
 * Reaching a colleague: message them, or call them.
 *
 * The same pair of buttons sits on the team page, the workspace card, the
 * employee panel, the management contacts list and the task detail card. Four
 * of them agreed on what the buttons do; the fifth — the task card — went its
 * own way and opened `mailto:` and `tel:` links instead. Those did nothing at
 * all, because the assignee rows it was reading carry no email or phone, so the
 * handlers fell through their own `&&` guard in silence.
 *
 * Behaviour lives here now so there is one answer to "what does Message do",
 * and so the day voice calling ships, one file changes instead of five. The
 * markup deliberately stays where it is — those five buttons look different on
 * purpose, and a shared component would have to fight each of them.
 */
export function useContactActions() {
  const { t } = useTranslation()
  const { openChatWith, canMessage } = useChat()

  /** Open a direct conversation. No contact details required — every colleague
   *  has an account. Ask `canMessage` first: there is no conversation with
   *  yourself, and a Message button that reaches you does nothing. */
  const message = useCallback((userId: string) => openChatWith(userId), [openChatWith])

  /**
   * Ring their phone if we hold a number; otherwise say what's actually true.
   * Voice calling inside the app isn't built yet.
   */
  const call = useCallback(
    (phone?: string | null) => {
      if (phone) {
        window.location.href = `tel:${phone}`
        return
      }
      notify.success(t("workspace.voiceCallComingSoon"))
    },
    [t],
  )

  return { message, call, canMessage }
}
