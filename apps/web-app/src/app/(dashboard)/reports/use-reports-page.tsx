"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Clock, Trash2 } from "lucide-react"
import {
  analyticsApi,
  customersApi,
  type ReportDefinition,
  type ReportResult,
  type ReportDatePreset,
  type DatasetMeta,
  type SavedReport,
  type ReportCadence,
} from "@/lib/api"
import { useOrgLetterhead } from "@/hooks/use-org-letterhead"
import { useAssignableMembers } from "@/hooks/use-assignable-members"
import { useAuth } from "@/contexts/auth-context"
import { useTimeFormat } from "@/hooks/use-time-format"
import { notify } from "@/lib/toast"
import { downloadBlob } from "@/lib/download"
import { formatReportCell } from "@/lib/report-pdf-options"
import { dateLocale } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import {
  localizeReportColumns,
  toCsv,
  localDateKey,
  todayKey,
  toISODateString,
} from "@hbcfield/shared/client"
import { useReportsPageData } from "./use-reports-page-data"

export const DATE_PRESETS: { value: ReportDatePreset; label: string }[] = [
  { value: "last_7d", label: "Last 7 days" }, { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" }, { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" }, { value: "this_year", label: "This year" }, { value: "all", label: "All time" },
]

// The table, its chart and the PDF read one cell formatter, in the reader's language.
export function fmt(value: unknown, format?: string): string {
  return formatReportCell(value, format, dateLocale())
}

// Through the shared builder: every cell quoted, formula-looking cells defused.
export function toCSV(result: ReportResult): string {
  return toCsv(result.rows, result.columns.map((c) => ({ header: c.label, value: (r: (typeof result.rows)[number]) => r[c.key] })))
}

/** ReportsPage's state and handlers — everything before its markup, moved here unchanged. */
export function useReportsPage() {
  const {
    t,
    lang,
    formatSchedule,
    canBuild,
    canSchedule,
    active,
    setActive,
    result,
    saveOpen,
    setSaveOpen,
    saveMeta,
    setSaveMeta,
    schedOpen,
    setSchedOpen,
    schedForm,
    setSchedForm,
    pdfOpen,
    setPdfOpen,
    tsCols,
    setTsCols,
    saved,
    orgProfile,
    customers,
    members,
    datasets,
    dsMeta,
    isAttendance,
    isDetail,
    hasCustomerDim,
    customerFilter,
    run,
    timesheet,
    save,
    del,
    schedules,
    createSched,
    delSched,
    pickSaved,
    newReport,
    runTimesheet,
    patchDef,
    setCustomerFilter,
    toggleArr,
  } = useReportsPageData()

  const openSave = () => { setSaveMeta({ name: active?.savedId ? active.name : "", description: "", isShared: true }); setSaveOpen(true) }
  const download = () => {
    if (!displayResult || !active) return
    const blob = new Blob([toCSV(displayResult)], { type: "text/csv;charset=utf-8;" })
    downloadBlob(blob, `${active.name.replace(/\s+/g, "-").toLowerCase()}-${todayKey()}.csv`)
  }
  // Human range label for the export subtitle (preset OR custom from–to).
  const rangeLabel = (() => {
    const dr = active?.def.dateRange
    if (!dr) return undefined
    if (dr.from || dr.to) {
      const f = dr.from ? new Date(dr.from).toLocaleDateString(dateLocale()) : "…"
      const to = dr.to ? new Date(dr.to).toLocaleDateString(dateLocale()) : "now"
      return `${f} – ${to}`
    }
    return DATE_PRESETS.find((p) => p.value === dr.preset)?.label
  })()
  // When scoped to one customer, feed their details into the PDF header.
  const preparedFor = (() => {
    if (!customerFilter) return undefined
    const c = customers.find((x) => x.name === customerFilter)
    if (!c) return { name: customerFilter, lines: [] as string[] }
    return { name: c.name, lines: [c.contactName || "", c.address || "", [c.phone, c.email].filter(Boolean).join("  •  ")].filter(Boolean) as string[] }
  })()
  const pdfMeta = active
    ? { title: active.name, subtitle: rangeLabel, preparedFor }
    : { title: "" }

  // Period control: "custom" when an explicit from/to range is set.
  const isCustomRange = !!(active?.def.dateRange?.from || active?.def.dateRange?.to)
  const toDateInput = (iso?: string) => (iso ? toISODateString(new Date(iso)) : "")

  const supportsTime = active && (active.def.granularity !== undefined)
  // For the detailed timesheet, show only the user-selected columns.
  const displayResult = useMemo<ReportResult | null>(() => {
    if (!result) return null
    if (!isDetail) return { ...result, columns: localizeReportColumns(result.columns, lang) }
    const keep = new Set(tsCols)
    // Clock-in/out arrive from the backend as 24h "HH:MM" strings. Re-format them
    // to honor the user's 12h/24h preference (set in Settings). Only non-empty
    // values are touched, so blank days still render "—".
    /*
      Hours in shift follow the columns chosen: the planned time inside the
      rota, minus Late when Late is shown, plus approved Overtime when Overtime
      is shown. Recomputed here so the table, the totals and the CSV/PDF all
      carry the same number.
    */
    const lateOn = keep.has("late")
    const otOn = keep.has("overtime")
    const rows = result.rows.map((r) => {
      const nr = { ...r }
      for (const k of ["shiftStart", "shiftEnd", "clockIn", "clockOut"]) if (nr[k]) nr[k] = formatSchedule(String(nr[k]))
      if (nr.plannedInShift !== undefined) {
        const v = Number(nr.plannedInShift) - (lateOn ? Number(nr.late) || 0 : 0) + (otOn ? Number(nr.overtime) || 0 : 0)
        nr.hoursInShift = Math.max(0, Math.round(v * 100) / 100)
      }
      return nr
    })
    return { columns: localizeReportColumns(result.columns.filter((c) => keep.has(c.key)), lang), rows }
  }, [result, isDetail, tsCols, formatSchedule, lang])
  const measureCols = displayResult?.columns.filter((c) => c.kind === "measure") || []
  const labelCol = displayResult?.columns.find((c) => c.kind === "period" || c.kind === "dimension")
  const chartMeasure = measureCols[0]
  const chartData = chartMeasure && labelCol
    ? (displayResult?.rows.slice(0, 12).map((r) => ({ label: String(fmt(r[labelCol.key], labelCol.format)), value: Number(r[chartMeasure.key]) || 0 })) || [])
    : []

  const NavBtn = ({ activeKey, onClick, icon: Icon, label, desc, onDelete, dataTour }: { activeKey: boolean; onClick: () => void; icon: typeof Clock; label: string; desc?: string; onDelete?: () => void; dataTour?: string }) => (
    <div data-tour={dataTour} className={cn("group/nav w-full rounded-xl border px-2.5 py-2.5 transition-all cursor-pointer flex items-start gap-2.5", activeKey ? "border-primary/50 bg-primary/[0.05] shadow-sm" : "border-transparent hover:bg-accent/50")} onClick={onClick}>
      <div className={cn("grid place-items-center h-8 w-8 rounded-lg shrink-0 transition-colors", activeKey ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover/nav:text-foreground")}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-sm font-medium text-foreground truncate">{label}</div>
        {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{desc}</p>}
      </div>
      {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="opacity-0 group-hover/nav:opacity-100 text-muted-foreground hover:text-red-600 shrink-0 pt-0.5"><Trash2 className="h-3.5 w-3.5" /></button>}
    </div>
  )

  return {
    t,
    lang,
    canBuild,
    canSchedule,
    active,
    setActive,
    result,
    saveOpen,
    setSaveOpen,
    saveMeta,
    setSaveMeta,
    schedOpen,
    setSchedOpen,
    schedForm,
    setSchedForm,
    pdfOpen,
    setPdfOpen,
    tsCols,
    setTsCols,
    saved,
    orgProfile,
    customers,
    members,
    datasets,
    dsMeta,
    isAttendance,
    isDetail,
    hasCustomerDim,
    customerFilter,
    run,
    timesheet,
    save,
    del,
    schedules,
    createSched,
    delSched,
    pickSaved,
    newReport,
    runTimesheet,
    patchDef,
    setCustomerFilter,
    toggleArr,
    openSave,
    download,
    rangeLabel,
    pdfMeta,
    isCustomRange,
    toDateInput,
    supportsTime,
    displayResult,
    labelCol,
    chartMeasure,
    chartData,
    NavBtn,
  }
}

/** What ReportsPage and its sections read. */
export type ReportsPageState = ReturnType<typeof useReportsPage>
