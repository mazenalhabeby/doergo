"use client"

import { usePathname } from "next/navigation"
import { useTranslation } from "react-i18next"
import { canContactColleagues } from "@hbcfield/shared/client"

import { useAuth } from "@/contexts/auth-context"
import { useChat } from "@/components/chat/chat-context"
import { CountDot, TopBarButton } from "./top-bar-icon"
import { Icon } from "@/components/ui/icon"

/**
 * Messages beside Approvals and the bell: the only way in to your conversations
 * that is not "Message" on a person. The count is the server's unread total,
 * kept live by the socket (use-chat-live) — never a reload of the list.
 * Hidden for anyone whose Messaging is switched off.
 */
export function MessagesButton() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const pathname = usePathname()
  const { openMessages, unread } = useChat()
  if (!user || !canContactColleagues(user as never)) return null

  return (
    <TopBarButton
      on={pathname === "/messages"}
      onClick={openMessages}
      data-tour="nav-messages"
      title={t("chat.title", "Messages")}
      aria-label={t("chat.navLabel", { count: unread, defaultValue: "Messages, {{count}} unread" })}
    >
      <Icon name="chat" />
      <CountDot n={unread} tone="accent" />
    </TopBarButton>
  )
}
