"use client"

import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { BarChart3 } from "lucide-react"
import { type ReportResult } from "@/lib/api"
import { CHART_COLORS } from "./chart-colors"
import { fmt } from "./report-options"
import { ReportsTableCard } from "./reports-table-card"

// recharts is heavy and only renders when a report actually produces a chart
// (audit R-C1). ssr:false — it measures the DOM.
const ReportBarChart = dynamic(() => import("./report-bar-chart").then((m) => m.ReportBarChart), { ssr: false })

/** KPI totals for the measure columns — sum, or average for percentages. */
function statCards(result: ReportResult): { label: string; value: string; format?: string }[] {
  return result.columns
    .filter((c) => c.kind === "measure")
    .map((c) => {
      const nums = result.rows.map((r) => Number(r[c.key]) || 0)
      const total = nums.reduce((a, b) => a + b, 0)
      const v = c.format === "percent" && nums.length ? total / nums.length : total
      return { label: c.label, value: fmt(v, c.format), format: c.format }
    })
}

/** A run's result: nothing for the period, or the totals, the top-12 chart and the table. */
export function ReportResults({ result, isDetail }: { result: ReportResult; isDetail: boolean }) {
  const { t } = useTranslation()
  const measureCols = result.columns.filter((c) => c.kind === "measure") || []
  const labelCol = result.columns.find((c) => c.kind === "period" || c.kind === "dimension")
  const chartMeasure = measureCols[0]
  const chartData =
    chartMeasure && labelCol
      ? result.rows.slice(0, 12).map((r) => ({
          label: String(fmt(r[labelCol.key], labelCol.format)),
          value: Number(r[chartMeasure.key]) || 0,
        })) || []
      : []

  if (result.rows.length === 0) {
    return (
      <div
        className={
          "rounded-2xl border border-border bg-card shadow-sm dark:shadow-none " +
          "dark:border-white/[0.08] p-14 text-center"
        }
      >
        <div className="grid place-items-center h-10 w-10 rounded-xl bg-muted mx-auto mb-3">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t("reports.noData", "No data for this period.")}</p>
      </div>
    )
  }

  return (
    <div data-tour="reports-results" className="space-y-5">
      {/* KPI stat cards */}
      {statCards(result).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {statCards(result).map((s, i) => (
            <div
              key={i}
              className={
                "rounded-2xl border border-border bg-card shadow-sm dark:shadow-none " + "dark:border-white/[0.08] p-4"
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  {s.label}
                </p>
              </div>
              <p className="text-2xl font-bold tabular-nums text-foreground mt-1.5">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart card (hidden for the day-by-day timesheet) */}
      {!isDetail && chartMeasure && labelCol && chartData.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none dark:border-white/[0.08] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              {t("reports.topBy", "Top {{measure}}", { measure: chartMeasure.label })}
            </h3>
            <span className="text-xs text-muted-foreground">
              {t("reports.topN", "Top {{n}}", { n: chartData.length })}
            </span>
          </div>
          <ReportBarChart
            data={chartData}
            measureLabel={chartMeasure.label}
            format={(v) => fmt(v, chartMeasure.format)}
          />
        </div>
      )}

      <ReportsTableCard result={result} />
    </div>
  )
}
