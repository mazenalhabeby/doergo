"use client"

import { useTranslation } from "react-i18next"
import { CalendarDays } from "lucide-react"
import { labelWord, type ApprovalDay } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { formatTimeAgo, formatMediumDate } from "@/lib/format-date"
import { UserAvatar } from "@/components/common/user-avatar"
import { nameParts } from "./name-parts"

/** One person's working day in the list: who, which day, and why it waits — as chips. */
export function DayRow({ day, active, onSelect }: { day: ApprovalDay; active: boolean; onSelect: () => void }) {
  const { t, i18n } = useTranslation()
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          active ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <UserAvatar
          {...nameParts(day.subject.name)}
          avatarUrl={day.subject.avatarUrl}
          seed={day.subject.id ?? day.subject.name}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium text-foreground">{day.subject.name || t("approvals.someone")}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3" aria-hidden />
              {t("approvals.day.label")} · {formatMediumDate(`${day.localDate}T12:00:00Z`)}
            </span>
          </div>
          <DayChips day={day} locale={i18n.language} />
        </div>
        {day.raisedAt && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTimeAgo(day.raisedAt)}</span>
        )}
      </button>
    </li>
  )
}

/** The day's reasons: its review labels (shared words) and the other kinds it holds. */
export function DayChips({ day, locale }: { day: ApprovalDay; locale: string }) {
  const { t } = useTranslation()
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {day.labels.map((code) => (
        <span
          key={code}
          className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
        >
          {labelWord(code, locale)}
        </span>
      ))}
      {day.kinds.map((k) => (
        <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {t(`approvals.kinds.${k}`)}
        </span>
      ))}
    </div>
  )
}
