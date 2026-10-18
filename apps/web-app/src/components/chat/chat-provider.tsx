"use client"

import { useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { messagePreview, personName, type ChatMessageEvent } from "@hbcfield/shared/client"
import { canOpenConversationWith } from "@/lib/chat-access"
import { useAuth } from "@/contexts/auth-context"
import { ChatContext } from "./chat-context"
import { chatViewing } from "./chat-viewing"
import { useChatBadge, useChatLive } from "./use-chat-live"

/** One pop-up per conversation: a second message replaces it, opening the thread closes it. */
export const chatToastId = (conversationId: string) => `chat:${conversationId}`

/**
 * Chat for the whole web app, with no window of its own (the drawer was removed
 * 2026-10-15): the live updates, the unread count, a pop-up for a message you
 * are not looking at, and "open a conversation", which goes to /messages.
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const router = useRouter()
  const enabled = !!user?.organizationId
  const unread = useChatBadge(enabled)

  const onIncoming = useCallback(
    (evt: ChatMessageEvent) => {
      const msg = evt.message
      if (!msg || msg.senderId === user?.id || evt.conversationId === chatViewing.id) return
      toast(msg.sender ? personName(msg.sender) : t("chat.title", "Messages"), {
        id: chatToastId(evt.conversationId),
        description: messagePreview(msg.body, msg.attachments).slice(0, 80),
        action: {
          label: t("chat.open", "Open"),
          onClick: () => router.push(`/messages?c=${encodeURIComponent(evt.conversationId)}`),
        },
      })
    },
    [user?.id, t, router],
  )
  useChatLive({ enabled, meId: user?.id, onIncoming })

  const canMessage = useCallback((userId?: string | null) => canOpenConversationWith(userId, user?.id), [user?.id])
  const openMessages = useCallback(() => router.push("/messages"), [router])
  const openChatWith = useCallback(
    (userId: string) => {
      if (!canMessage(userId)) {
        toast.error(t("chat.cannotMessageSelf", "You cannot start a conversation with yourself"))
        return
      }
      router.push(`/messages?with=${encodeURIComponent(userId)}`)
    },
    [canMessage, router, t],
  )

  const value = useMemo(
    () => ({ openMessages, openChatWith, canMessage, unread }),
    [openMessages, openChatWith, canMessage, unread],
  )
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
