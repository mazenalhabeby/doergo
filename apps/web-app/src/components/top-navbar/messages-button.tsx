"use client"

import { usePathname } from "next/navigation"
import { useTranslation } from "react-i18next"
import { MessageSquare } from "lucide-react"
import { canContactColleagues } from "@hbcfield/shared/client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { useChat } from "@/components/chat/chat-context"

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
    <Button
      variant="ghost"
      size="icon"
      className={cn("relative rounded-lg", pathname === "/messages" && "bg-accent")}
      onClick={openMessages}
      title={t("chat.title", "Messages")}
      aria-label={t("chat.navLabel", { count: unread, defaultValue: "Messages, {{count}} unread" })}
    >
      <MessageSquare className="h-5 w-5 text-muted-foreground" />
      {unread > 0 && (
        <span
          className={"absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center " +
            "justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold " +
            "tabular-nums text-white ring-2 ring-background"}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Button>
  )
}
