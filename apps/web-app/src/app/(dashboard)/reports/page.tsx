"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { BarChart3, Download, Play, Clock, Users, Building2, ClipboardList } from "lucide-react"

import {
  analyticsApi, type ReportTemplate, type ReportDefinition, type ReportResult,
  type ReportDatePreset, type ReportGranularity,
} from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const TEMPLATE_ICON: Record<string, typeof Clock> = {
  timesheet: Clock,
  customer_report: Building2,
  technician_performance: Users,
  task_summary: ClipboardList,
}

const DATE_PRESETS: { value: ReportDatePreset; label: string }[] = [
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All time" },
]

const GRANULARITIES: { value: ReportGranularity; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "none", label: "No time split" },
]

function fmt(value: unknown, format?: string): string {
  if (value == null) return "—"
  if (format === "hours") return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}h`
  if (format === "currency") return `€${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  if (format === "percent") return `${Number(value)}%`
  if (format === "number") return Number(value).toLocaleString()
  // period (date) or dimension
  const s = String(value)
  const d = new Date(s)
  if (!isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return d.toLocaleDateString()
  return s
}

function toCSV(result: ReportResult): string {
  const head = result.columns.map((c) => `"${c.label}"`).join(",")
  const lines = result.rows.map((r) =>
    result.columns.map((c) => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(","),
  )
  return [head, ...lines].join("\n")
}

export default function ReportsPage() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<ReportTemplate | null>(null)
  const [preset, setPreset] = useState<ReportDatePreset>("last_30d")
  const [granularity, setGranularity] = useState<ReportGranularity>("week")
  const [result, setResult] = useState<ReportResult | null>(null)

  const { data: catalog, isLoading } = useQuery({ queryKey: ["analyticsCatalog"], queryFn: () => analyticsApi.catalog() })
  const templates = catalog?.templates || []

  const run = useMutation({
    mutationFn: (def: ReportDefinition) => analyticsApi.run(def),
    onSuccess: (r) => setResult(r),
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to run report"),
  })

  const supportsTime = selected?.def.granularity !== undefined && selected?.def.granularity !== "none"

  const currentDef: ReportDefinition | null = useMemo(() => {
    if (!selected) return null
    return {
      ...selected.def,
      dateRange: { preset },
      granularity: supportsTime ? granularity : (selected.def.granularity ?? "none"),
    }
  }, [selected, preset, granularity, supportsTime])

  const pick = (tpl: ReportTemplate) => {
    setSelected(tpl)
    setResult(null)
    setGranularity((tpl.def.granularity as ReportGranularity) || "none")
    setPreset((tpl.def.dateRange?.preset as ReportDatePreset) || "last_30d")
  }

  const download = () => {
    if (!result || !selected) return
    const blob = new Blob([toCSV(result)], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${selected.key}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const measureCols = result?.columns.filter((c) => c.kind === "measure") || []
  const labelCol = result?.columns.find((c) => c.kind === "period" || c.kind === "dimension")
  const chartMeasure = measureCols[0]
  const maxVal = chartMeasure ? Math.max(...(result?.rows.map((r) => Number(r[chartMeasure.key]) || 0) || [1]), 1) : 1

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("reports.title", "Reports")}</h1>
            <p className="text-sm text-muted-foreground">{t("reports.subtitle", "Run reports on your team, jobs, tasks and customers.")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Templates */}
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-muted-foreground px-1">{t("common.loading", "Loading…")}</p>
            ) : templates.map((tpl) => {
              const Icon = TEMPLATE_ICON[tpl.key] || BarChart3
              return (
                <button
                  key={tpl.key}
                  onClick={() => pick(tpl)}
                  className={cn(
                    "w-full text-left rounded-xl border px-4 py-3 transition-colors",
                    selected?.key === tpl.key ? "border-primary bg-primary/[0.06]" : "border-border hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">{tpl.description}</p>
                </button>
              )
            })}
          </div>

          {/* Runner + results */}
          <div className="space-y-4">
            {!selected ? (
              <div className="rounded-2xl border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
                {t("reports.pickOne", "Pick a report on the left to get started.")}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">{t("reports.period", "Period")}</label>
                    <Select value={preset} onValueChange={(v) => setPreset(v as ReportDatePreset)}>
                      <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {supportsTime && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">{t("reports.groupBy", "Group by")}</label>
                      <Select value={granularity} onValueChange={(v) => setGranularity(v as ReportGranularity)}>
                        <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{GRANULARITIES.map((g) => <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button className="gap-1.5 h-9" disabled={run.isPending} onClick={() => currentDef && run.mutate(currentDef)}>
                    <Play className="h-3.5 w-3.5" />{run.isPending ? t("reports.running", "Running…") : t("reports.run", "Run report")}
                  </Button>
                  {result && (
                    <Button variant="outline" className="gap-1.5 h-9 ml-auto" onClick={download}>
                      <Download className="h-3.5 w-3.5" />{t("reports.exportCsv", "Export CSV")}
                    </Button>
                  )}
                </div>

                {result && (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    {result.rows.length === 0 ? (
                      <div className="p-12 text-center text-sm text-muted-foreground">{t("reports.noData", "No data for this period.")}</div>
                    ) : (
                      <>
                        {/* Bar chart on the first measure */}
                        {chartMeasure && labelCol && (
                          <div className="p-4 border-b border-border/60 space-y-1.5">
                            {result.rows.slice(0, 12).map((r, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <span className="w-32 shrink-0 truncate text-xs text-muted-foreground text-right">{fmt(r[labelCol.key], labelCol.format)}</span>
                                <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                  <div className="h-full bg-primary/70 rounded" style={{ width: `${(Number(r[chartMeasure.key]) / maxVal) * 100}%` }} />
                                </div>
                                <span className="w-20 shrink-0 text-xs font-medium tabular-nums text-right">{fmt(r[chartMeasure.key], chartMeasure.format)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Full table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border/60 text-left">
                                {result.columns.map((c) => (
                                  <th key={c.key} className={cn("px-4 py-2.5 text-xs font-semibold text-muted-foreground", c.kind === "measure" && "text-right")}>{c.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {result.rows.map((r, i) => (
                                <tr key={i} className="border-b border-border/40 hover:bg-accent/20">
                                  {result.columns.map((c) => (
                                    <td key={c.key} className={cn("px-4 py-2.5", c.kind === "measure" && "text-right tabular-nums font-medium")}>{fmt(r[c.key], c.format)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
