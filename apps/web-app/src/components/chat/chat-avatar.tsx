"use client"

import { useTranslation } from "react-i18next"
import { GradientIcon } from "@/components/ui/gradient-icon"
import { personInitials, type ChatConversation, type ChatUserRef } from "@hbcfield/shared/client"
import { presenceColor } from "./chat-format"

/** A person in chat: photo or initials, and a presence dot when presence may be shown. */
export function ChatAvatar({ u, size = 40, dot = true }: { u?: ChatUserRef | null; size?: number; dot?: boolean }) {
  // Presence does not cross an organization boundary, so an external person
  // arrives with none. Drawing the grey dot would state they are offline, which
  // is a different claim from "we don't publish this" — show no dot at all.
  const showDot = dot && !u?.isExternal
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-muted to-muted text-[11px] font-semibold text-muted-foreground"
        style={{ fontSize: size * 0.32 }}
      >
        {u?.avatarUrl ? (
          <img src={u.avatarUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          personInitials(u)
        )}
      </span>
      {showDot && (
        <span
          className={`absolute bottom-0 right-0 rounded-full ring-2 ring-background ${presenceColor(u?.presence)} ${u?.presence === "AVAILABLE" ? "motion-ping text-emerald-500" : ""}`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </span>
  )
}

/** A small tag on a person or thread: "External" (another company) or "Closed". */
export function ChatTag({ kind, small }: { kind: "external" | "closed"; small?: boolean }) {
  const { t } = useTranslation()
  const size = small ? "rounded px-1 py-px text-[9px]" : "rounded-md px-1.5 py-0.5 text-[10px]"
  const tone =
    kind === "external"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
      : "bg-muted text-muted-foreground"
  return (
    <span className={`shrink-0 font-medium ${size} ${tone}`}>
      {kind === "external" ? t("chat.external", "External") : t("chat.closed", "Closed")}
    </span>
  )
}

/** A conversation's picture: the person for a direct one, a group or a job sign otherwise. */
export function ConversationAvatar({
  c,
  size = 40,
}: {
  c: Pick<ChatConversation, "type" | "otherMember">
  size?: number
}) {
  if (c.type === "DIRECT") return <ChatAvatar u={c.otherMember} size={size} />
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-50 to-indigo-50 ring-1 ring-blue-500/10 dark:from-sky-500/10 dark:to-indigo-500/10"
      style={{ width: size, height: size }}
    >
      <GradientIcon name={c.type === "TASK" ? "job" : "group"} size={Math.round(size * 0.55)} />
    </span>
  )
}
