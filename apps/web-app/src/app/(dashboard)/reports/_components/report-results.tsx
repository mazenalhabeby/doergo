"use client"

import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { type ReportResult } from "@/lib/api"
import { Icon } from "@/components/ui/icon"
import { Panel } from "@/components/page/page-kit"
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
      <Panel className="flex flex-col items-center px-6 py-14 text-center">
        <span className="mb-3 grid size-10 place-items-center rounded-xl bg-shell-chip text-muted-foreground">
          <Icon name="reports" size={20} />
        </span>
        <p className="text-sm text-muted-foreground">{t("reports.noData", "No data for this period.")}</p>
      </Panel>
    )
  }

  const tiles = statCards(result)
  return (
    <div data-tour="reports-results" className="flex flex-col gap-3.5">
      {/* The totals — one tile per measure */}
      {tiles.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {tiles.map((s, i) => (
            <Panel key={i} as="div" className="flex flex-col gap-1 px-[18px] py-4">
              <p className="truncate text-[12.5px] text-muted-foreground">{s.label}</p>
              <p className="text-[26px] font-semibold tracking-[-0.04em] tabular-nums text-foreground">{s.value}</p>
            </Panel>
          ))}
        </div>
      )}

      {/* Chart card (hidden for the day-by-day timesheet) */}
      {!isDetail && chartMeasure && labelCol && chartData.length > 0 && (
        <Panel className="px-3 pb-4 pt-2">
          <div className="flex items-center gap-2.5 px-2.5 pb-3 pt-2">
            <h3 className="flex-1 text-sm font-semibold text-foreground">
              {t("reports.topBy", "Top {{measure}}", { measure: chartMeasure.label })}
            </h3>
            <span className="text-[13px] text-muted-foreground">
              {t("reports.topN", "Top {{n}}", { n: chartData.length })}
            </span>
          </div>
          <ReportBarChart
            data={chartData}
            measureLabel={chartMeasure.label}
            format={(v) => fmt(v, chartMeasure.format)}
          />
        </Panel>
      )}

      <ReportsTableCard result={result} />
    </div>
  )
}
