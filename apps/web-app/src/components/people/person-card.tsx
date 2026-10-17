"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { MessageSquare, User } from "lucide-react"
import { personName, chatPresenceLabel } from "@hbcfield/shared/client"
import type { Colleague } from "@/lib/api/types/team"
import { useContactActions } from "@/hooks/use-contact-actions"
import { useRouteAccess } from "@/hooks/use-route-access"
import { ChatAvatar } from "@/components/chat/chat-avatar"

/**
 * One person on Team: who, what they do, where, whether they are around — and
 * Message (only when chat's rule allows it) and Profile (their full page, for
 * whoever may open it; otherwise the short card).
 */
export function PersonCard({ person, onProfile }: { person: Colleague; onProfile: (p: Colleague) => void }) {
  const { t } = useTranslation()
  const { message } = useContactActions()
  const { may } = useRouteAccess()
  const fullPage = may(`/members/${person.id}`)
  const btn = "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition"
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
      <div className="flex min-w-0 items-center gap-3">
        <ChatAvatar u={person} size={40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{personName(person)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[person.position, person.spaceName].filter(Boolean).join(" · ") || chatPresenceLabel(person.presence, t)}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{chatPresenceLabel(person.presence, t)}</p>
        </div>
      </div>
      <div className="flex gap-1.5">
        {person.canMessage && (
          <button
            type="button"
            onClick={() => message(person.id)}
            className={`${btn} bg-primary text-primary-foreground hover:opacity-90`}
          >
            <MessageSquare className="size-3.5" />
            {t("chat.message", "Message")}
          </button>
        )}
        {fullPage ? (
          <Link href={`/members/${person.id}`} className={`${btn} border border-border hover:bg-muted`}>
            <User className="size-3.5" />
            {t("team.profile", "Profile")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onProfile(person)}
            className={`${btn} border border-border hover:bg-muted`}
          >
            <User className="size-3.5" />
            {t("team.profile", "Profile")}
          </button>
        )}
      </div>
    </div>
  )
}
