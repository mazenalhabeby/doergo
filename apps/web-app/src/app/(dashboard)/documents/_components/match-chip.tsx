"use client"

import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Row } from "../_lib/issue-rows"

export function MatchChip({ row }: { row: Row }) {
  const { t } = useTranslation()
  if (row.state === "staged") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:bg-green-950 dark:text-green-400">
        <Check className="h-3 w-3" />{t("documents.issue.staged")}
      </span>
    )
  }
  if (row.state === "failed") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
        {t("documents.issue.failed")}
      </span>
    )
  }
  const map: Record<string, string> = {
    EXACT: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
    FUZZY: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    UNMATCHED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", map[row.confidence])}>
        {row.scanning
          ? t("documents.issue.reading", "reading the file…")
          : t(`documents.issue.confidence.${row.confidence.toLowerCase()}`)}
      </span>
      {row.memberSource === "content" && (
        <span className="text-[10.5px] text-blue-600 dark:text-blue-400">
          {t("documents.issue.fromFile", "read from the file")}
        </span>
      )}
    </span>
  )
}
