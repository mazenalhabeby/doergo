"use client"

import { useTranslation } from "react-i18next"
import { CircleDot, Clock } from "lucide-react"
import { dateLocale } from "@/lib/format-date"

/*
  One custody period as a line — read from the asset (who had it) and from the
  member (what they had); both say "has it now" and "from – to · N days" alike.
*/

export function HasItNowBadge() {
  const { t } = useTranslation()
  return (
    <span
      className={"inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 " +
        "text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 " +
        "dark:text-emerald-300"}>
      <CircleDot className="h-2.5 w-2.5" /> {t("custody.now", "Has it now")}
    </span>
  )
}

export function CustodySpan({ startedAt, endedAt, days }: { startedAt: string; endedAt: string | null | undefined; days: number }) {
  const { t } = useTranslation()
  return (
    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      {new Date(startedAt).toLocaleDateString(dateLocale())}
      {" – "}
      {endedAt ? new Date(endedAt).toLocaleDateString(dateLocale()) : t("custody.present", "now")}
      {" · "}
      {t("custody.days", "{{count}} days", { count: days })}
    </p>
  )
}
