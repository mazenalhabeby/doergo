"use client"

import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"
import { Chip } from "@/components/page/page-kit"
import type { Row } from "../_lib/issue-rows"

export function MatchChip({ row }: { row: Row }) {
  const { t } = useTranslation()
  if (row.state === "staged") {
    return (
      <Chip tone="accent">
        <Check className="h-3 w-3" />
        {t("documents.issue.staged")}
      </Chip>
    )
  }
  if (row.state === "failed") {
    return <Chip tone="crit">{t("documents.issue.failed")}</Chip>
  }
  const tone = { EXACT: "accent", FUZZY: "warn", UNMATCHED: "crit" } as const
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Chip dot tone={tone[row.confidence as keyof typeof tone] ?? "soft"}>
        {row.scanning
          ? t("documents.issue.reading", "reading the file…")
          : t(`documents.issue.confidence.${row.confidence.toLowerCase()}`)}
      </Chip>
      {row.memberSource === "content" && (
        <span className="text-[10.5px] text-shell-accent">{t("documents.issue.fromFile", "read from the file")}</span>
      )}
    </span>
  )
}
