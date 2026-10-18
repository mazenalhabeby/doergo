"use client"

import Link from "next/link"
import { CHART_COLORS } from "./_components/chart-colors"
import {
  Timer,
  BarChart3,
  Download,
  FileText,
  Save,
  Pencil,
  Lock,
  CalendarClock,
  ChevronDown,
  Table2,
  SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { reportLabel } from "@hbcfield/shared/client"
import { fmt } from "./use-reports-page"
import { ReportBarChart, statCards } from "./reports-page-helpers"
import { ReportsPageDataset } from "./reports-page-dataset"
import type { ReportsPageState } from "./use-reports-page"

/** Part of the parent component's markup, moved here unchanged; it reads the state from `vm`. */
export function ReportsTableCard({ vm }: { vm: ReportsPageState }) {
  const { t, displayResult } = vm
  // Rendered only under the parent's `displayResult` check; re-checked here for the type only.
  if (!displayResult) return null
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
