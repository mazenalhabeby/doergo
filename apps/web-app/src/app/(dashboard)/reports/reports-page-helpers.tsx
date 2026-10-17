"use client"

import dynamic from "next/dynamic"
import { type ReportResult, type ReportGranularity } from "@/lib/api"
import { fmt } from "./use-reports-page"

/** ReportsPage's module-level helpers, moved here unchanged so its sections can read them too. */
// recharts is heavy and only renders when a report actually produces a chart
// (audit R-C1). ssr:false — it measures the DOM.
export const ReportBarChart = dynamic(
  () => import("./_components/report-bar-chart").then((m) => m.ReportBarChart),
  { ssr: false },
)

export const GRANULARITIES: { value: ReportGranularity; label: string }[] = [
  { value: "none", label: "No time split" }, { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" },
]

// Tasteful, colorful chart palette (Stripe-ish).

// Selectable columns for the detailed timesheet. Every column is freely
// toggleable; the picker only enforces that at least one stays selected.
// Named from the same catalogue as the table headings (`col.<key>`), so the
// chip and the column it adds cannot be called two different things.
export const TIMESHEET_COLS: string[] = [
  "date", "day", "shiftStart", "shiftEnd", "clockIn", "clockOut", "break", "hours", "hoursInShift",
  "late", "overtime", "jobs", "leaveReason", "location", "remote", "note", "status",
]

/*
  The column key stays `hours` (saved choices keep working); what it holds is
  clock time minus breaks, so its chip reads "Hours worked" beside "Hours in
  shift" — two numbers called "Hours" would be read as the same thing.
*/
export const TIMESHEET_LABEL: Record<string, string> = { hours: "col.hoursWorked" }

/** KPI totals for the measure columns — sum, or average for percentages. */
export function statCards(result: ReportResult): { label: string; value: string; format?: string }[] {
  return result.columns
    .filter((c) => c.kind === "measure")
    .map((c) => {
      const nums = result.rows.map((r) => Number(r[c.key]) || 0)
      const total = nums.reduce((a, b) => a + b, 0)
      const v = c.format === "percent" && nums.length ? total / nums.length : total
      return { label: c.label, value: fmt(v, c.format), format: c.format }
    })
}
