"use client"

import { useTranslation } from "react-i18next"
import { CalendarDays } from "lucide-react"
import { labelWord, type ApprovalDay } from "@hbcfield/shared/client"
import { formatTimeAgo, formatMediumDate } from "@/lib/format-date"
import { UserAvatar } from "@/components/common/user-avatar"
import { Chip, ROW } from "@/components/page/page-kit"
import { nameParts } from "./name-parts"

/** One person's working day in the list: who, which day, and why it waits — as chips. */
export function DayRow({
  day,
  active,
  onSelect,
  yourTurn,
}: {
  day: ApprovalDay
  active: boolean
  onSelect: () => void
  /** One of the day's items waits for the reader's approval under an office rule. */
  yourTurn?: boolean
}) {
  const { t, i18n } = useTranslation()
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        data-approval-key={day.key}
        className={ROW}
      >
        <UserAvatar
          soft
          {...nameParts(day.subject.name)}
          avatarUrl={day.subject.avatarUrl}
          seed={day.subject.id ?? day.subject.name}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {day.subject.name || t("approvals.someone")}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3" aria-hidden />
              {t("approvals.day.label")} · {formatMediumDate(`${day.localDate}T12:00:00Z`)}
            </span>
          </div>
          <DayChips day={day} locale={i18n.language} yourTurn={yourTurn} />
        </div>
        {day.raisedAt && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTimeAgo(day.raisedAt)}</span>
        )}
      </button>
    </li>
  )
}

/** The day's reasons: its review labels (shared words) and the other kinds it holds. */
export function DayChips({ day, locale, yourTurn }: { day: ApprovalDay; locale: string; yourTurn?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {yourTurn && <Chip tone="crit">{t("approvals.yours")}</Chip>}
      {day.labels.map((code) => (
        <Chip key={code} tone="warn" dot>
          {labelWord(code, locale)}
        </Chip>
      ))}
      {day.kinds.map((k) => (
        <Chip key={k}>{t(`approvals.kinds.${k}`)}</Chip>
      ))}
    </div>
  )
}
