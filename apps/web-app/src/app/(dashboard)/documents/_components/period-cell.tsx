"use client"

import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import type { DocumentCadence } from "@hbcfield/shared/client"
import { MONTHS_KEY, type Row } from "../_lib/issue-rows"

/**
 * The period, and a way to supply one.
 *
 * ⚠️ It has to be editable. Reading the filename and then the file itself
 * answers most rows, but not all — a photograph saved as a PDF, an invoice that
 * dates itself only in a sentence, a scan. Before this, such a row could only be
 * fixed by cancelling, renaming the file outside the app and dropping it again,
 * while the screen showed the type's rule rather than a way to satisfy it.
 *
 * Where the value CAME from is shown, because "read out of the document" and
 * "typed by me" deserve different amounts of scrutiny from a reviewer, and a
 * value that appeared from nowhere invites nobody to check it.
 */
export function PeriodCell({
  row,
  cadence,
  onChange,
}: {
  row: Row
  cadence: DocumentCadence
  onChange: (patch: Partial<Row>) => void
}) {
  const { t } = useTranslation()
  if (cadence === "ONE_OFF") return <span className="text-muted-foreground">—</span>
  if (row.scanning) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("documents.issue.reading", "reading the file…")}
      </span>
    )
  }

  const needsMonth = cadence === "MONTHLY"
  const yearOptions = (() => {
    const now = new Date().getFullYear()
    return [now + 1, now, now - 1, now - 2]
  })()

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {needsMonth && (
          <select
            value={row.periodMonth ?? ""}
            onChange={(e) =>
              onChange({ periodMonth: e.target.value ? Number(e.target.value) : null, periodSource: undefined })
            }
            className="rounded-md border border-border bg-card px-1.5 py-1 text-[12px]"
          >
            <option value="">{t("documents.issue.month", "Month")}</option>
            {MONTHS_KEY.map((m, i) => (
              <option key={m} value={i + 1}>
                {t(`documents.months.${m}`)}
              </option>
            ))}
          </select>
        )}
        <select
          value={row.periodYear ?? ""}
          onChange={(e) =>
            onChange({ periodYear: e.target.value ? Number(e.target.value) : null, periodSource: undefined })
          }
          className={"rounded-md border border-border bg-card px-1.5 py-1 text-[12px] " + "tabular-nums "}
        >
          <option value="">{t("documents.issue.year", "Year")}</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {row.periodSource === "content" && (
        <span className="text-[10.5px] text-shell-accent">{t("documents.issue.fromFile", "read from the file")}</span>
      )}
      {row.periodConflict && (
        <span className="text-[10.5px] font-medium text-shell-warn">
          {t("documents.issue.periodConflict", "the filename and the file disagree — check this one")}
        </span>
      )}
    </div>
  )
}
