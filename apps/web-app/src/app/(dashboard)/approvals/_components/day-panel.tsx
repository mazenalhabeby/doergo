"use client"

import { useTranslation } from "react-i18next"
import { CheckCheck, ChevronRight } from "lucide-react"
import { describeApproval, type ApprovalDay, type ApprovalItem, type ApprovalT } from "@hbcfield/shared/client"
import { dateLocale, formatMediumDate } from "@/lib/format-date"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { nameParts } from "./name-parts"
import { DayChips } from "./day-row"

/**
 * One working day: what waits, each item one tap away ("Review"), and "Approve
 * day" for the items that need nothing more than a yes. Extra time and overtime
 * need minutes, so they are always opened on their own.
 */
export function DayPanel({
  day,
  members,
  busy,
  onApprove,
  onReview,
  orgCurrency,
}: {
  day: ApprovalDay
  members: ApprovalItem[]
  busy: boolean
  onApprove: () => void
  onReview: (item: ApprovalItem) => void
  orgCurrency?: string | null
}) {
  const { t, i18n } = useTranslation()
  const needsMinutes = day.kinds.some((k) => k === "extraTime" || k === "overtime")
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <UserAvatar
          {...nameParts(day.subject.name)}
          avatarUrl={day.subject.avatarUrl}
          seed={day.subject.id ?? day.subject.name}
          size="lg"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{day.subject.name || t("approvals.someone")}</p>
          <p className="text-sm text-muted-foreground">
            {t("approvals.day.label")} · {formatMediumDate(`${day.localDate}T12:00:00Z`)}
            {day.space ? ` · ${day.space.name}` : ""}
          </p>
        </div>
      </div>
      <DayChips day={day} locale={i18n.language} />
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("approvals.day.members")} · {t("approvals.day.count", { count: members.length })}
        </p>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {members.map((m) => {
            const text = describeApproval(m, t as ApprovalT, dateLocale(), orgCurrency)
            return (
              <li key={`${m.kind}:${m.id}`}>
                <button
                  type="button"
                  onClick={() => onReview(m)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50"
                >
                  <span className="shrink-0 text-xs text-muted-foreground">{t(`approvals.kinds.${m.kind}`)}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{text.headline}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {needsMinutes && <p className="text-xs text-muted-foreground">{t("approvals.day.needsMinutes")}</p>}
      {day.approvable.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("approvals.day.nothingToApprove")}</p>
      ) : (
        <Button className="w-full rounded-xl" onClick={onApprove} disabled={busy}>
          <CheckCheck className="size-4" />
          {t("approvals.day.approve")}
        </Button>
      )}
    </div>
  )
}
