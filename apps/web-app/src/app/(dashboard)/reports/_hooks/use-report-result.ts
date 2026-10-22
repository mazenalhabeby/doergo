"use client"

import { useMemo } from "react"
import { type ReportResult } from "@/lib/api"
import { downloadBlob } from "@/lib/download"
import { dateLocale } from "@/lib/format-date"
import { useTimeFormat } from "@/hooks/use-time-format"
import { localizeReportColumns, toCsv, todayKey } from "@hbcfield/shared/client"
import { DATE_PRESETS } from "../_components/report-options"
import type { ActiveReport, ReportBuilder } from "./use-report-builder"

// Through the shared builder: every cell quoted, formula-looking cells defused.
function toCSV(result: ReportResult): string {
  return toCsv(
    result.rows,
    result.columns.map((c) => ({ header: c.label, value: (r: (typeof result.rows)[number]) => r[c.key] })),
  )
}

type ReportResultInput = Pick<
  ReportBuilder,
  "result" | "isDetail" | "tsCols" | "lang" | "customers" | "customerFilter"
> & {
  active: ActiveReport | null
}

/** What a run shows and takes away: the localized result (table, CSV, PDF all read it), its range and its PDF header. */
export function useReportResult({
  active,
  result,
  isDetail,
  tsCols,
  lang,
  customers,
  customerFilter,
}: ReportResultInput) {
  const { formatSchedule } = useTimeFormat()

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
    return {
      name: c.name,
      lines: [c.contactName || "", c.address || "", [c.phone, c.email].filter(Boolean).join("  •  ")].filter(
        Boolean,
      ) as string[],
    }
  })()
  const pdfMeta = active ? { title: active.name, subtitle: rangeLabel, preparedFor } : { title: "" }

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
      for (const k of ["shiftStart", "shiftEnd", "clockIn", "clockOut"])
        if (nr[k]) nr[k] = formatSchedule(String(nr[k]))
      if (nr.plannedInShift !== undefined) {
        const v =
          Number(nr.plannedInShift) - (lateOn ? Number(nr.late) || 0 : 0) + (otOn ? Number(nr.overtime) || 0 : 0)
        nr.hoursInShift = Math.max(0, Math.round(v * 100) / 100)
      }
      return nr
    })
    return {
      columns: localizeReportColumns(
        result.columns.filter((c) => keep.has(c.key)),
        lang,
      ),
      rows,
    }
  }, [result, isDetail, tsCols, formatSchedule, lang])

  return { displayResult, rangeLabel, pdfMeta, download }
}
