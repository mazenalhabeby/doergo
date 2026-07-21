"use client"

import { useMemo, useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { BarChart3, Download, FileText, Play, Clock, Save, Trash2, Pencil, Lock, CalendarClock, ChevronDown, Table2, SlidersHorizontal } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell } from "recharts"

import {
  analyticsApi, organizationsApi, customersApi, employeesApi, type ReportDefinition, type ReportResult,
  type ReportDatePreset, type ReportGranularity, type DatasetMeta, type SavedReport,
  type ReportCadence,
} from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { type ReportBranding } from "@/lib/report-pdf"
import { ReportExportStudio } from "@/components/reports/report-export-studio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const DATE_PRESETS: { value: ReportDatePreset; label: string }[] = [
  { value: "last_7d", label: "Last 7 days" }, { value: "last_30d", label: "Last 30 days" },
  { value: "last_90d", label: "Last 90 days" }, { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" }, { value: "this_year", label: "This year" }, { value: "all", label: "All time" },
]
const GRANULARITIES: { value: ReportGranularity; label: string }[] = [
  { value: "none", label: "No time split" }, { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" },
]

function fmt(value: unknown, format?: string): string {
  if (value == null) return "—"
  if (format === "hours") return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}h`
  if (format === "currency") return `€${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  if (format === "percent") return `${Number(value)}%`
  if (format === "number") return Number(value).toLocaleString()
  const s = String(value)
  const d = new Date(s)
  if (!isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return d.toLocaleDateString()
  return s
}
function toCSV(result: ReportResult): string {
  const head = result.columns.map((c) => `"${c.label}"`).join(",")
  const lines = result.rows.map((r) => result.columns.map((c) => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(","))
  return [head, ...lines].join("\n")
}

// Tasteful, colorful chart palette (Stripe-ish).
const CHART_COLORS = ["#6366f1", "#3b82f6", "#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b", "#f43f5e", "#a855f7"]

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

interface ActiveReport {
  def: ReportDefinition
  name: string
  builder: boolean // editable measures/dimensions/dataset
  savedId?: string
  kind?: "timesheet" // special report types (not the aggregation builder)
  userId?: string // for the detailed timesheet
}

export default function ReportsPage() {
  const { t } = useTranslation()
  const { hasPlanFeature } = useAuth()
  const qc = useQueryClient()
  const canBuild = hasPlanFeature("reports_builder")
  const canSchedule = hasPlanFeature("report_scheduling")

  const [active, setActive] = useState<ActiveReport | null>(null)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveMeta, setSaveMeta] = useState({ name: "", description: "", isShared: true })
  const [schedOpen, setSchedOpen] = useState(false)
  const [schedForm, setSchedForm] = useState<{ cadence: ReportCadence; hour: number; dayOfWeek: number; dayOfMonth: number; recipients: string }>({ cadence: "weekly", hour: 7, dayOfWeek: 1, dayOfMonth: 1, recipients: "" })
  const [pdfOpen, setPdfOpen] = useState(false)

  const { data: catalog } = useQuery({ queryKey: ["analyticsCatalog"], queryFn: () => analyticsApi.catalog() })
  const { data: saved } = useQuery({ queryKey: ["savedReports"], queryFn: () => analyticsApi.listSaved() })
  const { data: orgProfile } = useQuery({ queryKey: ["orgProfile"], queryFn: () => organizationsApi.getProfile() })
  const { data: customersData } = useQuery({ queryKey: ["customersAll"], queryFn: () => customersApi.list({ limit: 200 }) })
  const customers = customersData?.data || []
  const { data: employeesData } = useQuery({ queryKey: ["employeesAll"], queryFn: () => employeesApi.list({ limit: 200, status: "all" }) })
  const employees = employeesData?.data || []
  const datasets = catalog?.datasets || []
  const dsMeta: DatasetMeta | undefined = datasets.find((d) => d.key === active?.def.dataset)
  const isTimesheet = active?.kind === "timesheet"
  const hasCustomerDim = !isTimesheet && !!dsMeta?.dimensions.some((d) => d.key === "customer")
  // Current single-customer "eq" filter value (customer dimension is name-based).
  const customerFilter = active?.def.filters?.find((f) => f.field === "customer" && f.op === "eq")?.value as string | undefined

  const run = useMutation({
    mutationFn: (def: ReportDefinition) => analyticsApi.run(def),
    onSuccess: setResult,
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to run report"),
  })
  const timesheet = useMutation({
    mutationFn: (p: { userId: string; from?: string; to?: string }) => analyticsApi.timesheet(p.userId, { from: p.from, to: p.to }),
    onSuccess: (data) => {
      setResult({ columns: data.columns, rows: data.rows })
      setActive((a) => (a ? { ...a, name: `${t("reports.timesheetFor", "Timesheet")} — ${data.userName}` } : a))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to load timesheet"),
  })
  const save = useMutation({
    mutationFn: async () => {
      if (!active) return
      const input = { name: saveMeta.name, description: saveMeta.description, config: active.def, isShared: saveMeta.isShared }
      return active.savedId ? analyticsApi.updateSaved(active.savedId, input) : analyticsApi.createSaved(input)
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["savedReports"] })
      setSaveOpen(false)
      if (r) setActive({ def: r.config, name: r.name, builder: canBuild, savedId: r.id })
      notify.success(t("reports.saved", "Report saved"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to save"),
  })
  const del = useMutation({
    mutationFn: (id: string) => analyticsApi.deleteSaved(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["savedReports"] }); setActive(null); setResult(null); notify.success(t("reports.deleted", "Report deleted")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to delete"),
  })

  const { data: schedules } = useQuery({
    queryKey: ["reportSchedules", active?.savedId],
    queryFn: () => analyticsApi.listSchedules(active!.savedId!),
    enabled: !!active?.savedId && canSchedule && schedOpen,
  })
  const createSched = useMutation({
    mutationFn: () => analyticsApi.createSchedule({
      reportDefinitionId: active!.savedId!,
      cadence: schedForm.cadence,
      hour: schedForm.hour,
      dayOfWeek: schedForm.cadence === "weekly" ? schedForm.dayOfWeek : null,
      dayOfMonth: schedForm.cadence === "monthly" ? schedForm.dayOfMonth : null,
      recipients: schedForm.recipients.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reportSchedules"] }); setSchedForm((f) => ({ ...f, recipients: "" })); notify.success(t("reports.scheduled", "Schedule created")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to schedule"),
  })
  const delSched = useMutation({
    mutationFn: (id: string) => analyticsApi.deleteSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reportSchedules"] }),
  })

  const pickSaved = (r: SavedReport) => { setResult(null); setActive({ def: r.config, name: r.name, builder: false, savedId: r.id }) }
  const newReport = () => {
    setResult(null)
    const ds = datasets[0]
    if (!ds) return
    setActive({ def: { dataset: ds.key, measures: ds.measures[0] ? [ds.measures[0].key] : [], dimensions: [], granularity: "none", dateRange: { preset: "last_30d" } }, name: t("reports.untitled", "Untitled report"), builder: true })
  }
  // Default to the builder on first load (no templates — the dataset selector is always the entry point).
  useEffect(() => {
    if (!active && datasets.length) newReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets.length])
  // Detailed daily timesheet for one user (special report kind).
  const pickTimesheet = () => {
    setResult(null)
    setActive({ kind: "timesheet", name: t("reports.timesheetDetail", "Detailed timesheet"), builder: false, userId: undefined, def: { dataset: "attendance", measures: [], dateRange: { preset: "last_30d" } } })
  }
  const resolveRange = (dr?: ReportDefinition["dateRange"]): { from?: string; to?: string } => {
    if (!dr) return {}
    if (dr.from || dr.to) return { from: dr.from, to: dr.to }
    const now = new Date(); const iso = (d: Date) => d.toISOString()
    switch (dr.preset) {
      case "last_7d": return { from: iso(new Date(now.getTime() - 6 * 864e5)), to: iso(now) }
      case "last_90d": return { from: iso(new Date(now.getTime() - 89 * 864e5)), to: iso(now) }
      case "this_month": return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }
      case "last_month": return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) }
      case "this_year": return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) }
      case "last_30d": default: return { from: iso(new Date(now.getTime() - 29 * 864e5)), to: iso(now) }
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

  const openSave = () => { setSaveMeta({ name: active?.savedId ? active.name : "", description: "", isShared: true }); setSaveOpen(true) }
  const download = () => {
    if (!result || !active) return
    const blob = new Blob([toCSV(result)], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `${active.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }
  // Human range label for the export subtitle (preset OR custom from–to).
  const rangeLabel = (() => {
    const dr = active?.def.dateRange
    if (!dr) return undefined
    if (dr.from || dr.to) {
      const f = dr.from ? new Date(dr.from).toLocaleDateString() : "…"
      const to = dr.to ? new Date(dr.to).toLocaleDateString() : "now"
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
  const toDateInput = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : "")

  const supportsTime = active && (active.def.granularity !== undefined)
  const measureCols = result?.columns.filter((c) => c.kind === "measure") || []
  const labelCol = result?.columns.find((c) => c.kind === "period" || c.kind === "dimension")
  const chartMeasure = measureCols[0]
  const chartData = chartMeasure && labelCol
    ? (result?.rows.slice(0, 12).map((r) => ({ label: String(fmt(r[labelCol.key], labelCol.format)), value: Number(r[chartMeasure.key]) || 0 })) || [])
    : []

  const NavBtn = ({ activeKey, onClick, icon: Icon, label, desc, onDelete }: { activeKey: boolean; onClick: () => void; icon: typeof Clock; label: string; desc?: string; onDelete?: () => void }) => (
    <div className={cn("group/nav w-full rounded-xl border px-2.5 py-2.5 transition-all cursor-pointer flex items-start gap-2.5", activeKey ? "border-primary/50 bg-primary/[0.05] shadow-sm" : "border-transparent hover:bg-accent/50")} onClick={onClick}>
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

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Page Header — matches the app's standard page header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">{t("reports.title", "Reports")}</h1>
            <p className="mt-1.5 text-muted-foreground">{t("reports.subtitle", "Run reports on your team, jobs, tasks and customers.")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Left: report modes + saved */}
          <div className="space-y-5">
            <div className="space-y-1">
              <NavBtn activeKey={!!active?.builder} onClick={newReport} icon={SlidersHorizontal} label={t("reports.builderNav", "Report builder")} desc={t("reports.builderNavDesc", "Pick a dataset, measures and grouping")} />
              <NavBtn activeKey={isTimesheet} onClick={pickTimesheet} icon={Clock} label={t("reports.timesheetDetail", "Detailed timesheet")} desc={t("reports.timesheetNavDesc", "Day-by-day clock-in/out per user")} />
            </div>
            {(saved && saved.length > 0) && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">{t("reports.myTemplates", "My templates")}</p>
                <div className="space-y-1">
                  {saved.map((r) => (
                    <NavBtn key={r.id} activeKey={active?.savedId === r.id} onClick={() => pickSaved(r)} icon={BarChart3} label={r.name} desc={r.description || undefined} onDelete={canBuild ? () => del.mutate(r.id) : undefined} />
                  ))}
                </div>
              </div>
            )}
            {canBuild && (!saved || saved.length === 0) && (
              <p className="text-[11px] text-muted-foreground px-1 leading-snug">
                {t("reports.templatesHint", "Build a report, then “Save as template” to reuse it here.")}
              </p>
            )}
          </div>

          {/* Right: builder/runner + results */}
          <div className="space-y-4">
            {!active ? (
              <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none dark:border-white/[0.08] p-16 text-center">
                <div className="grid place-items-center h-12 w-12 rounded-2xl bg-primary/10 text-primary mx-auto mb-4"><BarChart3 className="h-6 w-6" /></div>
                <p className="text-base font-semibold text-foreground">{t("reports.pickOneTitle", "No report selected")}</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">{t("reports.pickOne", "Pick a report on the left, or build a custom one.")}</p>
              </div>
            ) : (
              <>
                {/* ── Report header: identity + meta-actions ──────────────────── */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-foreground truncate">{active.name}</h2>
                      <Badge variant="secondary" className="shrink-0 font-normal">
                        {isTimesheet ? t("reports.badgeTimesheet", "Timesheet") : active.builder ? t("reports.badgeCustom", "Custom") : active.savedId ? t("reports.badgeSaved", "Saved") : t("reports.badgeTemplate", "Template")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(isTimesheet ? [rangeLabel] : [dsMeta?.label, rangeLabel, customerFilter]).filter(Boolean).join("  ·  ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isTimesheet && canBuild && !active.builder && (
                      <Button variant="ghost" size="sm" className="gap-1.5 h-9" onClick={() => setActive((a) => a ? { ...a, builder: true } : a)}>
                        <Pencil className="h-3.5 w-3.5" />{t("reports.customize", "Customize")}
                      </Button>
                    )}
                    {!isTimesheet && canBuild && (
                      <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={openSave}>
                        <Save className="h-3.5 w-3.5" />{active.savedId ? t("reports.updateTemplate", "Update template") : t("reports.saveTemplate", "Save as template")}
                      </Button>
                    )}
                    {!isTimesheet && canSchedule && active.savedId && (
                      <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={() => setSchedOpen(true)}>
                        <CalendarClock className="h-3.5 w-3.5" />{t("reports.schedule", "Schedule")}
                      </Button>
                    )}
                    {result && result.rows.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1.5 h-9"><Download className="h-3.5 w-3.5" />{t("reports.export", "Export")}<ChevronDown className="h-3.5 w-3.5 opacity-60" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={download} className="gap-2"><Table2 className="h-4 w-4" />{t("reports.exportCsv", "Download CSV")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPdfOpen(true)} className="gap-2"><FileText className="h-4 w-4" />{t("reports.exportPdfMenu", "Export PDF…")}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {/* ── Configure & run ─────────────────────────────────────────── */}
                <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none dark:border-white/[0.08] divide-y divide-border/60">
                  {/* Detailed timesheet: pick a user */}
                  {isTimesheet && (
                    <div className="flex items-center gap-3 p-4">
                      <Label className="text-xs w-20 shrink-0">{t("reports.user", "User")}</Label>
                      <Select value={active.userId ?? ""} onValueChange={(v) => setActive((a) => (a ? { ...a, userId: v } : a))}>
                        <SelectTrigger className="h-9 w-[240px] text-xs"><SelectValue placeholder={t("reports.pickUser", "Select a technician…")} /></SelectTrigger>
                        <SelectContent>
                          {employees.map((e) => <SelectItem key={e.id} value={e.id} className="text-xs">{e.firstName} {e.lastName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Builder fields (dataset / measures / group by) */}
                  {!isTimesheet && active.builder && dsMeta && (
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <Label className="text-xs w-20 shrink-0">{t("reports.dataset", "Dataset")}</Label>
                        <Select value={active.def.dataset} onValueChange={(v) => { const d = datasets.find((x) => x.key === v); patchDef({ dataset: v, measures: d?.measures[0] ? [d.measures[0].key] : [], dimensions: [] }) }}>
                          <SelectTrigger className="h-9 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{datasets.map((d) => <SelectItem key={d.key} value={d.key} className="text-xs">{d.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-start gap-3">
                        <Label className="text-xs w-20 shrink-0 pt-1.5">{t("reports.measures", "Measures")}</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {dsMeta.measures.map((m) => {
                            const on = (active.def.measures || []).includes(m.key)
                            return <button key={m.key} onClick={() => toggleArr("measures", m.key)} className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{m.label}</button>
                          })}
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Label className="text-xs w-20 shrink-0 pt-1.5">{t("reports.groupByDim", "Group by")}</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {dsMeta.dimensions.map((dim) => {
                            const on = (active.def.dimensions || []).includes(dim.key)
                            return <button key={dim.key} onClick={() => toggleArr("dimensions", dim.key)} className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{dim.label}</button>
                          })}
                        </div>
                      </div>
                      {/* Scope to one customer → the export becomes their statement. */}
                      {hasCustomerDim && (
                        <div className="flex items-center gap-3">
                          <Label className="text-xs w-20 shrink-0">{t("reports.customer", "Customer")}</Label>
                          <Select value={customerFilter ?? "__all__"} onValueChange={(v) => setCustomerFilter(v === "__all__" ? undefined : v)}>
                            <SelectTrigger className="h-9 w-[220px] text-xs"><SelectValue placeholder={t("reports.allCustomers", "All customers")} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__" className="text-xs">{t("reports.allCustomers", "All customers")}</SelectItem>
                              {customers.map((c) => <SelectItem key={c.id} value={c.name} className="text-xs">{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {customerFilter && <span className="text-[11px] text-muted-foreground">{t("reports.customerScoped", "Export shows this customer's details")}</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Period / time split + Run */}
                  <div className="flex flex-wrap items-end gap-3 p-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">{t("reports.period", "Period")}</label>
                      <Select
                        value={isCustomRange ? "__custom__" : (active.def.dateRange?.preset || "last_30d")}
                        onValueChange={(v) => {
                          if (v === "__custom__") {
                            const to = new Date(); const from = new Date(to.getTime() - 30 * 86400000)
                            patchDef({ dateRange: { from: from.toISOString(), to: to.toISOString() } })
                          } else patchDef({ dateRange: { preset: v as ReportDatePreset } })
                        }}
                      >
                        <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>)}
                          <SelectItem value="__custom__" className="text-xs">{t("reports.customRange", "Custom range…")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {isCustomRange && (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground">{t("reports.from", "From")}</label>
                          <Input type="date" value={toDateInput(active.def.dateRange?.from)} max={toDateInput(active.def.dateRange?.to) || undefined}
                            onChange={(e) => patchDef({ dateRange: { ...active.def.dateRange, from: e.target.value ? new Date(e.target.value).toISOString() : undefined } })}
                            className="h-9 w-[150px] text-xs" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground">{t("reports.to", "To")}</label>
                          <Input type="date" value={toDateInput(active.def.dateRange?.to)} min={toDateInput(active.def.dateRange?.from) || undefined}
                            onChange={(e) => patchDef({ dateRange: { ...active.def.dateRange, to: e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : undefined } })}
                            className="h-9 w-[150px] text-xs" />
                        </div>
                      </>
                    )}
                    {!isTimesheet && supportsTime && (
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">{t("reports.timeSplit", "Time split")}</label>
                        <Select value={active.def.granularity || "none"} onValueChange={(v) => patchDef({ granularity: v as ReportGranularity })}>
                          <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{GRANULARITIES.map((g) => <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {isTimesheet ? (
                      <Button className="gap-1.5 h-9 ml-auto" disabled={timesheet.isPending || !active.userId} onClick={runTimesheet}>
                        <Play className="h-3.5 w-3.5" />{timesheet.isPending ? t("reports.running", "Running…") : t("reports.run", "Run report")}
                      </Button>
                    ) : (
                      <Button className="gap-1.5 h-9 ml-auto" disabled={run.isPending || !(active.def.measures?.length)} onClick={() => run.mutate(active.def)}>
                        <Play className="h-3.5 w-3.5" />{run.isPending ? t("reports.running", "Running…") : t("reports.run", "Run report")}
                      </Button>
                    )}
                  </div>
                </div>

                {!canBuild && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" />{t("reports.builderLocked", "Custom report builder is available on Professional and above.")}</p>
                )}

                {/* ── Results ─────────────────────────────────────────────────── */}
                {result && (result.rows.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none dark:border-white/[0.08] p-14 text-center">
                    <div className="grid place-items-center h-10 w-10 rounded-xl bg-muted mx-auto mb-3"><BarChart3 className="h-5 w-5 text-muted-foreground" /></div>
                    <p className="text-sm text-muted-foreground">{t("reports.noData", "No data for this period.")}</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* KPI stat cards */}
                    {statCards(result).length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                        {statCards(result).map((s, i) => (
                          <div key={i} className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none dark:border-white/[0.08] p-4">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{s.label}</p>
                            </div>
                            <p className="text-2xl font-bold tabular-nums text-foreground mt-1.5">{s.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Chart card (hidden for the day-by-day timesheet) */}
                    {!isTimesheet && chartMeasure && labelCol && chartData.length > 0 && (
                      <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none dark:border-white/[0.08] p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-foreground">{t("reports.topBy", "Top {{measure}}", { measure: chartMeasure.label })}</h3>
                          <span className="text-xs text-muted-foreground">{t("reports.topN", "Top {{n}}", { n: chartData.length })}</span>
                        </div>
                        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 34)}>
                          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v, chartMeasure.format)} />
                            <YAxis type="category" dataKey="label" width={132} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                            <RTooltip cursor={{ fill: "hsl(var(--muted))" }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.14)" }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} formatter={((v: unknown) => [fmt(Number(v), chartMeasure.format), chartMeasure.label]) as never} />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
                              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Table card */}
                    <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none dark:border-white/[0.08] overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/70">
                        <p className="text-sm font-semibold text-foreground">{t("reports.details", "Details")}</p>
                        <p className="text-xs text-muted-foreground">{t("reports.rowCount", "{{count}} rows", { count: result.rows.length })}</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="text-left">{result.columns.map((c) => <th key={c.key} className={cn("px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40", c.kind === "measure" && "text-right")}>{c.label}</th>)}</tr></thead>
                          <tbody>{result.rows.map((r, i) => <tr key={i} className="border-t border-border/50 hover:bg-accent/30 transition-colors">{result.columns.map((c) => <td key={c.key} className={cn("px-5 py-3 text-foreground", c.kind === "measure" && "text-right tabular-nums font-semibold")}>{fmt(r[c.key], c.format)}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{active?.savedId ? t("reports.updateTemplateTitle", "Update template") : t("reports.saveTemplateTitle", "Save as template")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">{t("reports.name", "Name")} *</Label><Input value={saveMeta.name} onChange={(e) => setSaveMeta({ ...saveMeta, name: e.target.value })} placeholder="Weekly overtime" /></div>
            <div className="space-y-1.5"><Label className="text-xs">{t("reports.description", "Description")}</Label><Input value={saveMeta.description} onChange={(e) => setSaveMeta({ ...saveMeta, description: e.target.value })} /></div>
            <div className="flex items-center justify-between"><Label className="text-xs">{t("reports.shareOrg", "Share with the whole organization")}</Label><Switch checked={saveMeta.isShared} onCheckedChange={(v) => setSaveMeta({ ...saveMeta, isShared: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button disabled={!saveMeta.name.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule dialog */}
      <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("reports.scheduleTitle", "Schedule email delivery")}</DialogTitle></DialogHeader>

          {/* Existing schedules */}
          {schedules && schedules.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-border p-2">
              {schedules.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium capitalize">{s.cadence}</span> @ {String(s.hour).padStart(2, "0")}:00 UTC → {s.recipients.join(", ")}
                  </span>
                  <button onClick={() => delSched.mutate(s.id)} className="text-muted-foreground hover:text-red-600 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          {/* New schedule */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("reports.cadence", "Frequency")}</Label>
                <Select value={schedForm.cadence} onValueChange={(v) => setSchedForm({ ...schedForm, cadence: v as ReportCadence })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                    <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                    <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("reports.hour", "Hour (UTC)")}</Label>
                <Input type="number" min={0} max={23} value={schedForm.hour} onChange={(e) => setSchedForm({ ...schedForm, hour: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })} />
              </div>
            </div>
            {schedForm.cadence === "weekly" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("reports.dayOfWeek", "Day of week")}</Label>
                <Select value={String(schedForm.dayOfWeek)} onValueChange={(v) => setSchedForm({ ...schedForm, dayOfWeek: Number(v) })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => <SelectItem key={i} value={String(i)} className="text-xs">{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {schedForm.cadence === "monthly" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("reports.dayOfMonth", "Day of month (1–28)")}</Label>
                <Input type="number" min={1} max={28} value={schedForm.dayOfMonth} onChange={(e) => setSchedForm({ ...schedForm, dayOfMonth: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">{t("reports.recipients", "Recipients (comma-separated emails)")}</Label>
              <Input value={schedForm.recipients} onChange={(e) => setSchedForm({ ...schedForm, recipients: e.target.value })} placeholder="anna@example.com, john@example.com" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSchedOpen(false)}>{t("common.close", "Close")}</Button>
            <Button disabled={!schedForm.recipients.trim() || createSched.isPending} onClick={() => createSched.mutate()}>{createSched.isPending ? t("common.saving", "Saving…") : t("reports.addSchedule", "Add schedule")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full-screen PDF export studio — visual template gallery + live preview */}
      <ReportExportStudio
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        result={result}
        meta={pdfMeta}
        branding={(orgProfile || {}) as ReportBranding}
        canCustom={canBuild}
        defaultName={active?.name}
      />
    </div>
  )
}
