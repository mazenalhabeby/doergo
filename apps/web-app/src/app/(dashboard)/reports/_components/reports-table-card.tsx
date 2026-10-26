"use client"

import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { type ReportResult } from "@/lib/api"
import { fmt } from "./report-options"
import { Panel } from "@/components/page/page-kit"

/** The result as a table, one row per row, measures right-aligned. */
export function ReportsTableCard({ result: displayResult }: { result: ReportResult }) {
  const { t } = useTranslation()
  return (
    <Panel className="overflow-hidden px-2 pb-1.5 pt-2">
      <div className="flex items-center gap-2.5 px-2.5 pb-2.5 pt-2">
        <p className="flex-1 text-sm font-semibold text-foreground">{t("reports.details", "Details")}</p>
        <p className="text-[13px] text-muted-foreground">
          {t("reports.rowCount", "{{count}} rows", { count: displayResult.rows.length })}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left">
              {displayResult.columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "h-[38px] whitespace-nowrap px-2.5 text-xs font-semibold text-muted-foreground",
                    c.kind === "measure" && "text-right",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayResult.rows.map((r, i) => (
              <tr key={i} className="border-t border-border transition-colors hover:bg-accent">
                {displayResult.columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "h-[42px] px-2.5 text-foreground",
                      c.kind === "measure" && "text-right font-semibold tabular-nums",
                    )}
                  >
                    {fmt(r[c.key], c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
