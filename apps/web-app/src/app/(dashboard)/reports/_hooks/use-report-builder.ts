"use client"

import { keys } from "@/lib/query-keys"
import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  analyticsApi,
  customersApi,
  type ReportDefinition,
  type ReportResult,
  type DatasetMeta,
  type SavedReport,
} from "@/lib/api"
import { useAssignableMembers } from "@/hooks/use-assignable-members"
import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { localDateKey } from "@hbcfield/shared/client"

const TIMESHEET_DEFAULT = [
  "date",
  "day",
  "shiftStart",
  "shiftEnd",
  "clockIn",
  "clockOut",
  "break",
  "hours",
  "hoursInShift",
  "status",
]

export interface ActiveReport {
  def: ReportDefinition
  name: string
  builder: boolean // editable measures/dimensions/dataset
  savedId?: string
  detail?: boolean // attendance "Detailed" view (day-by-day per user) instead of aggregate
  userId?: string // for the detailed timesheet
}

/** The report being built or run: its definition, the catalogue it is built from, and running it. */
export function useReportBuilder() {
  const { t, i18n } = useTranslation()
  /*
    Column and dataset names are the system's own, and read in the viewer's
    language from REPORT_LABELS — the catalogue the scheduled email reads too.
    What the table shows is what the CSV and PDF take away, so localizing the
    result once below names the export in the same language.
  */
  const lang = i18n.language
  const { hasPlanFeature } = useAuth()
  const qc = useQueryClient()
  const canBuild = hasPlanFeature("reports_builder")
  const canSchedule = hasPlanFeature("report_scheduling")

  const [active, setActive] = useState<ActiveReport | null>(null)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [tsCols, setTsCols] = useState<string[]>(TIMESHEET_DEFAULT)

  const { data: catalog } = useQuery({ queryKey: keys.reports.catalog(), queryFn: () => analyticsApi.catalog() })
  const { data: saved } = useQuery({ queryKey: keys.reports.saved(), queryFn: () => analyticsApi.listSaved() })
  const { data: customersData } = useQuery({
    queryKey: keys.customers.list({ limit: 200 }),
    queryFn: () => customersApi.list({ limit: 200 }),
  })
  const customers = customersData?.data || []
  // People to report on: the directory for whoever may read it, else the rosters they can see.
  const { members } = useAssignableMembers({})
  const datasets = catalog?.datasets || []
  const dsMeta: DatasetMeta | undefined = datasets.find((d) => d.key === active?.def.dataset)
  // "Detailed" attendance view (day-by-day per user) — only for the attendance dataset.
  const isAttendance = active?.def.dataset === "attendance"
  const isDetail = !!active?.detail && isAttendance
  const hasCustomerDim = !isDetail && !!dsMeta?.dimensions.some((d) => d.key === "customer")
  // Current single-customer "eq" filter value (customer dimension is name-based).
  const customerFilter = active?.def.filters?.find((f) => f.field === "customer" && f.op === "eq")?.value as
    string | undefined

  const run = useMutation({
    mutationFn: (def: ReportDefinition) => analyticsApi.run(def),
    onSuccess: setResult,
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to run report"),
  })
  const timesheet = useMutation({
    mutationFn: (p: { userId: string; from?: string; to?: string }) =>
      analyticsApi.timesheet(p.userId, { from: p.from, to: p.to }),
    onSuccess: (data) => {
      setResult({ columns: data.columns, rows: data.rows })
      setActive((a) => (a ? { ...a, name: `${t("reports.timesheetFor", "Timesheet")} — ${data.userName}` } : a))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to load timesheet"),
  })
  const del = useMutation({
    mutationFn: (id: string) => analyticsApi.deleteSaved(id),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: keys.reports.saved(),
      })
      setActive(null)
      setResult(null)
      notify.success(t("reports.deleted", "Report deleted"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to delete"),
  })

  const pickSaved = (r: SavedReport) => {
    setResult(null)
    setActive({ def: r.config, name: r.name, builder: false, savedId: r.id })
  }
  const newReport = () => {
    setResult(null)
    const ds = datasets[0]
    if (!ds) return
    setActive({
      def: {
        dataset: ds.key,
        measures: ds.measures[0] ? [ds.measures[0].key] : [],
        dimensions: [],
        granularity: "none",
        dateRange: { preset: "last_30d" },
      },
      name: t("reports.untitled", "Untitled report"),
      builder: true,
    })
  }
  // Default to the builder on first load (no templates — the dataset selector is always the entry point).
  useEffect(() => {
    if (!active && datasets.length) newReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets.length])
  const resolveRange = (dr?: ReportDefinition["dateRange"]): { from?: string; to?: string } => {
    if (!dr) return {}
    if (dr.from || dr.to) return { from: dr.from, to: dr.to }
    const now = new Date()
    // Emit LOCAL calendar dates as YYYY-MM-DD. Using toISOString() here converted
    // local midnight to UTC and shifted the month boundary to the previous day
    // (e.g. "last month" started on Jun 30 instead of Jul 1) for users east of UTC.
    const ymd = (d: Date) => localDateKey(d)
    const Y = now.getFullYear(),
      M = now.getMonth(),
      D = now.getDate()
    switch (dr.preset) {
      case "last_7d":
        return { from: ymd(new Date(Y, M, D - 6)), to: ymd(now) }
      case "last_90d":
        return { from: ymd(new Date(Y, M, D - 89)), to: ymd(now) }
      case "this_month":
        return { from: ymd(new Date(Y, M, 1)), to: ymd(now) }
      case "last_month":
        return { from: ymd(new Date(Y, M - 1, 1)), to: ymd(new Date(Y, M, 0)) }
      case "this_year":
        return { from: ymd(new Date(Y, 0, 1)), to: ymd(now) }
      case "last_30d":
      default:
        return { from: ymd(new Date(Y, M, D - 29)), to: ymd(now) }
    }
  }
  const runTimesheet = () => {
    if (!active?.userId) return
    const { from, to } = resolveRange(active.def.dateRange)
    timesheet.mutate({ userId: active.userId, from, to })
  }

  const patchDef = (p: Partial<ReportDefinition>) => setActive((a) => (a ? { ...a, def: { ...a.def, ...p } } : a))
  // Scope the report to a single customer (or clear). Uses the name-based
  // customer dimension so it works on any dataset that has one.
  const setCustomerFilter = (name: string | undefined) =>
    setActive((a) => {
      if (!a) return a
      const others = (a.def.filters || []).filter((f) => f.field !== "customer")
      const filters = name ? [...others, { field: "customer", op: "eq" as const, value: name }] : others
      return { ...a, def: { ...a.def, filters } }
    })
  const toggleArr = (key: "measures" | "dimensions", val: string) =>
    setActive((a) => {
      if (!a) return a
      const cur = a.def[key] || []
      const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]
      return { ...a, def: { ...a.def, [key]: next } }
    })

  return {
    lang,
    canBuild,
    canSchedule,
    active,
    setActive,
    result,
    tsCols,
    setTsCols,
    saved,
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
    del,
    pickSaved,
    newReport,
    runTimesheet,
    patchDef,
    setCustomerFilter,
    toggleArr,
  }
}

/** What the reports screen reads from the builder. */
export type ReportBuilder = ReturnType<typeof useReportBuilder>
