"use client"

import type { KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { CheckCheck, ChevronRight } from "lucide-react"
import { kindNeedsMinutes, type ApprovalDay, type ApprovalItem } from "@hbcfield/shared/client"
import { formatMediumDate } from "@/lib/format-date"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/page/page-kit"
import { UserAvatar } from "@/components/common/user-avatar"
import { nameParts } from "./name-parts"
import { DayChips } from "./day-row"
import { describeItem } from "../_lib/describe"

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
  const needsMinutes = day.kinds.some(kindNeedsMinutes)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <UserAvatar
          soft
          {...nameParts(day.subject.name)}
          avatarUrl={day.subject.avatarUrl}
          seed={day.subject.id ?? day.subject.name}
          size="lg"
        />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold text-foreground">
            {day.subject.name || t("approvals.someone")}
          </p>
          <p className="text-[13px] text-muted-foreground">
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
        <ul
          className="divide-y divide-border overflow-hidden rounded-[14px] border border-border"
          // ↑ / ↓ move between the day's items (the focus follows) — kept here, so the inbox list does not walk away.
          onKeyDown={walkButtons}
        >
          {members.map((m) => {
            const text = describeItem(m, t, orgCurrency)
            return (
              <li key={`${m.kind}:${m.id}`}>
                <button
                  type="button"
                  onClick={() => onReview(m)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50"
                >
                  <span className="shrink-0 text-xs text-muted-foreground">{t(`approvals.kinds.${m.kind}`)}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{text.headline}</span>
                  {m.step?.waitsForYou && <Chip tone="crit">{t("approvals.yours")}</Chip>}
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
        <Button size="pillLg" className="w-full" onClick={onApprove} disabled={busy}>
          <CheckCheck className="size-4" />
          {t("approvals.day.approve")}
        </Button>
      )}
    </div>
  )
}

/** Roving focus over a list's buttons: ↑ / ↓ to the previous / next, Home / End to the first / last. */
function walkButtons(e: KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")]
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (at < 0) return
  const last = buttons.length - 1
  const to =
    e.key === "Home" ? 0 : e.key === "End" ? last : Math.min(last, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))
  e.preventDefault()
  e.stopPropagation()
  buttons[to]?.focus()
}
