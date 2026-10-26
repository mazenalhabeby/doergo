"use client"

import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"
import { Users } from "lucide-react"
import { cn } from "@/lib/utils"

type Attendee = {
  userId: string
  firstName: string
  lastName?: string | null
  response: string
  isOrganizer?: boolean
}

/** Who is invited and what each answered: going in jade, maybe in amber, declined struck through. */
export function ItemAttendees({ attendees }: { attendees: Attendee[] }) {
  const { t } = useTranslation()
  const going = attendees.filter((a) => a.response === "ACCEPTED").length
  return (
    <div className="flex items-start gap-2.5">
      <Users className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-foreground">{t("calendar.going", { count: going, total: attendees.length })}</span>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {attendees.map((a) => (
            <span
              key={a.userId}
              title={`${personName(a)} · ${t(`calendar.rsvpState.${a.response}`)}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]",
                a.response === "ACCEPTED" && "border-transparent bg-shell-accent-soft text-shell-accent",
                a.response === "DECLINED" && "text-muted-foreground line-through",
                a.response === "MAYBE" &&
                  "border-transparent bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] text-shell-warn",
              )}
            >
              {a.firstName}
              {a.isOrganizer && <span className="text-[10px] opacity-70">· {t("calendar.organizer")}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
