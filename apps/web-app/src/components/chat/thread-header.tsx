"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { GradientIcon } from "@/components/ui/gradient-icon"
import { toast } from "sonner"
import { conversationTitle, chatPresenceLabel, type ChatConversation } from "@hbcfield/shared/client"
import { chatApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ChatTag, ConversationAvatar } from "./chat-avatar"

const HOUR = 3_600_000
/** How long a mute lasts: an hour, a working day, a week — or until switched back on (a year). */
const MUTES = [
  { key: "hour", ms: HOUR, label: "chat.muteHour", fallback: "For 1 hour" },
  { key: "day", ms: 8 * HOUR, label: "chat.muteDay", fallback: "For 8 hours" },
  { key: "week", ms: 7 * 24 * HOUR, label: "chat.muteWeek", fallback: "For a week" },
  { key: "always", ms: 365 * 24 * HOUR, label: "chat.muteAlways", fallback: "Until I turn it back on" },
] as const

/** Who the conversation is with, whether they are around, and its notifications switch. */
export function ThreadHeader({ conversation, onBack }: { conversation: ChatConversation; onBack?: () => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const muted = !!conversation.mutedUntil && Date.parse(conversation.mutedUntil) > Date.now()
  const mute = useMutation({
    mutationFn: (until: string | null) => chatApi.mute(conversation.id, until),
    onSuccess: ({ mutedUntil }) =>
      qc.setQueryData<ChatConversation[]>(keys.chat.conversations(), (list) =>
        list?.map((c) => (c.id === conversation.id ? { ...c, mutedUntil } : c)),
      ),
    onError: (e) => toast.error((e as Error).message),
  })

  return (
    <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.back", "Back")}
          className="icon-motion flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:hidden"
        >
          <GradientIcon name="backLine" size={18} flat />
        </button>
      )}
      <ConversationAvatar c={conversation} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">
            {conversationTitle(conversation, i18n.language)}
          </span>
          {conversation.isExternal && <ChatTag kind="external" />}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {conversation.type === "TASK"
            ? t("chat.taskChat", "Job chat · the crew and the office")
            : conversation.type === "GROUP"
              ? t("chat.peopleCount", { count: conversation.members?.length ?? 0, defaultValue: "{{count}} people" })
              : conversation.isExternal
                ? t("chat.externalMember", "At another organization")
                : chatPresenceLabel(conversation.otherMember?.presence, t)}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={muted ? t("chat.muted", "Notifications off") : t("chat.mute", "Turn notifications off")}
            title={muted ? t("chat.muted", "Notifications off") : t("chat.mute", "Turn notifications off")}
            className="icon-motion flex size-9 items-center justify-center rounded-full transition-colors hover:bg-blue-500/10"
          >
            <GradientIcon name={muted ? "bellOff" : "bell"} size={21} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {muted ? (
            <DropdownMenuItem onClick={() => mute.mutate(null)}>
              {t("chat.unmute", "Turn notifications back on")}
            </DropdownMenuItem>
          ) : (
            MUTES.map((m) => (
              <DropdownMenuItem key={m.key} onClick={() => mute.mutate(new Date(Date.now() + m.ms).toISOString())}>
                {t(m.label, m.fallback)}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
