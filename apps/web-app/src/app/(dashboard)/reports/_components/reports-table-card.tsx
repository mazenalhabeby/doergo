"use client"

import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { type ReportResult } from "@/lib/api"
import { fmt } from "./report-options"

/** The result as a table, one row per row, measures right-aligned. */
export function ReportsTableCard({ result: displayResult }: { result: ReportResult }) {
  const { t } = useTranslation()
  return (
    <>
      {/* Table card */}
      <div
        className={
          "rounded-2xl border border-border bg-card shadow-sm dark:shadow-none " +
          "dark:border-white/[0.08] overflow-hidden"
        }
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/70">
          <p className="text-sm font-semibold text-foreground">{t("reports.details", "Details")}</p>
          <p className="text-xs text-muted-foreground">
            {t("reports.rowCount", "{{count}} rows", { count: displayResult.rows.length })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {displayResult.columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider " +
                        "text-muted-foreground bg-muted/40",
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
                <tr key={i} className="border-t border-border/50 hover:bg-accent/30 transition-colors">
                  {displayResult.columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-5 py-3 text-foreground",
                        c.kind === "measure" && "text-right tabular-nums font-semibold",
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
      </div>
    </>
  )
}
