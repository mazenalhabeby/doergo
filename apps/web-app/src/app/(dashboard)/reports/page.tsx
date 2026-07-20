"use client"

import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { BarChart3, Download, Play, Clock, Users, Building2, ClipboardList, Plus, Save, Trash2, Pencil, Lock, CalendarClock } from "lucide-react"

import {
  analyticsApi, type ReportTemplate, type ReportDefinition, type ReportResult,
  type ReportDatePreset, type ReportGranularity, type DatasetMeta, type SavedReport,
  type ReportCadence,
} from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const TEMPLATE_ICON: Record<string, typeof Clock> = {
  timesheet: Clock, customer_report: Building2, technician_performance: Users, task_summary: ClipboardList,
}

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

interface ActiveReport {
  def: ReportDefinition
  name: string
  builder: boolean // editable measures/dimensions/dataset
  savedId?: string
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

  const { data: catalog } = useQuery({ queryKey: ["analyticsCatalog"], queryFn: () => analyticsApi.catalog() })
  const { data: saved } = useQuery({ queryKey: ["savedReports"], queryFn: () => analyticsApi.listSaved() })
  const templates = catalog?.templates || []
  const datasets = catalog?.datasets || []
  const dsMeta: DatasetMeta | undefined = datasets.find((d) => d.key === active?.def.dataset)

  const run = useMutation({
    mutationFn: (def: ReportDefinition) => analyticsApi.run(def),
    onSuccess: setResult,
    onError: (e) => notify.error(e instanceof Error ? e.message : "Failed to run report"),
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

  const pickTemplate = (tpl: ReportTemplate) => { setResult(null); setActive({ def: { ...tpl.def }, name: tpl.name, builder: false }) }
  const pickSaved = (r: SavedReport) => { setResult(null); setActive({ def: r.config, name: r.name, builder: false, savedId: r.id }) }
  const newReport = () => {
    setResult(null)
    const ds = datasets[0]
    if (!ds) return
    setActive({ def: { dataset: ds.key, measures: ds.measures[0] ? [ds.measures[0].key] : [], dimensions: [], granularity: "none", dateRange: { preset: "last_30d" } }, name: "Untitled report", builder: true })
  }

  const patchDef = (p: Partial<ReportDefinition>) => setActive((a) => (a ? { ...a, def: { ...a.def, ...p } } : a))
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

  const supportsTime = active && (active.def.granularity !== undefined)
  const measureCols = result?.columns.filter((c) => c.kind === "measure") || []
  const labelCol = result?.columns.find((c) => c.kind === "period" || c.kind === "dimension")
  const chartMeasure = measureCols[0]
  const maxVal = chartMeasure ? Math.max(...(result?.rows.map((r) => Number(r[chartMeasure.key]) || 0) || [1]), 1) : 1

  const NavBtn = ({ activeKey, onClick, icon: Icon, label, desc, onDelete }: { activeKey: boolean; onClick: () => void; icon: typeof Clock; label: string; desc?: string; onDelete?: () => void }) => (
    <div className={cn("group/nav w-full rounded-xl border px-3 py-2.5 transition-colors cursor-pointer flex items-start gap-2", activeKey ? "border-primary bg-primary/[0.06]" : "border-border hover:bg-accent/40")} onClick={onClick}>
      <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">{label}</div>
        {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{desc}</p>}
      </div>
      {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="opacity-0 group-hover/nav:opacity-100 text-muted-foreground hover:text-red-600 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>}
    </div>
  )

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

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          {/* Left: templates + saved + new */}
          <div className="space-y-4">
            {canBuild && (
              <Button onClick={newReport} className="w-full gap-1.5"><Plus className="h-4 w-4" />{t("reports.new", "New custom report")}</Button>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 px-1">{t("reports.templates", "Templates")}</p>
              <div className="space-y-1.5">
                {templates.map((tpl) => (
                  <NavBtn key={tpl.key} activeKey={active?.name === tpl.name && !active?.savedId && !active?.builder} onClick={() => pickTemplate(tpl)} icon={TEMPLATE_ICON[tpl.key] || BarChart3} label={tpl.name} desc={tpl.description} />
                ))}
              </div>
            </div>
            {(saved && saved.length > 0) && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 px-1">{t("reports.saved", "Saved reports")}</p>
                <div className="space-y-1.5">
                  {saved.map((r) => (
                    <NavBtn key={r.id} activeKey={active?.savedId === r.id} onClick={() => pickSaved(r)} icon={BarChart3} label={r.name} desc={r.description || undefined} onDelete={canBuild ? () => del.mutate(r.id) : undefined} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: builder/runner + results */}
          <div className="space-y-4">
            {!active ? (
              <div className="rounded-2xl border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
                {t("reports.pickOne", "Pick a report on the left, or build a custom one.")}
              </div>
            ) : (
              <>
                {/* Builder fields (Pro+ custom reports) */}
                {active.builder && dsMeta && (
                  <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
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
                          return <button key={m.key} onClick={() => toggleArr("measures", m.key)} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{m.label}</button>
                        })}
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Label className="text-xs w-20 shrink-0 pt-1.5">{t("reports.groupByDim", "Group by")}</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {dsMeta.dimensions.map((dim) => {
                          const on = (active.def.dimensions || []).includes(dim.key)
                          return <button key={dim.key} onClick={() => toggleArr("dimensions", dim.key)} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{dim.label}</button>
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Run controls */}
                <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">{t("reports.period", "Period")}</label>
                    <Select value={active.def.dateRange?.preset || "last_30d"} onValueChange={(v) => patchDef({ dateRange: { preset: v as ReportDatePreset } })}>
                      <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {supportsTime && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">{t("reports.timeSplit", "Time split")}</label>
                      <Select value={active.def.granularity || "none"} onValueChange={(v) => patchDef({ granularity: v as ReportGranularity })}>
                        <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{GRANULARITIES.map((g) => <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button className="gap-1.5 h-9" disabled={run.isPending || !(active.def.measures?.length)} onClick={() => run.mutate(active.def)}>
                    <Play className="h-3.5 w-3.5" />{run.isPending ? t("reports.running", "Running…") : t("reports.run", "Run")}
                  </Button>
                  {canBuild && (
                    <Button variant="outline" className="gap-1.5 h-9" onClick={openSave}>
                      <Save className="h-3.5 w-3.5" />{active.savedId ? t("reports.update", "Update") : t("reports.save", "Save")}
                    </Button>
                  )}
                  {canSchedule && active.savedId && (
                    <Button variant="outline" className="gap-1.5 h-9" onClick={() => setSchedOpen(true)}>
                      <CalendarClock className="h-3.5 w-3.5" />{t("reports.schedule", "Schedule")}
                    </Button>
                  )}
                  {canBuild && !active.builder && (
                    <Button variant="ghost" className="gap-1.5 h-9" onClick={() => setActive((a) => a ? { ...a, builder: true } : a)}>
                      <Pencil className="h-3.5 w-3.5" />{t("reports.customize", "Customize")}
                    </Button>
                  )}
                  {result && <Button variant="outline" className="gap-1.5 h-9 ml-auto" onClick={download}><Download className="h-3.5 w-3.5" />CSV</Button>}
                </div>

                {result && (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    {result.rows.length === 0 ? (
                      <div className="p-12 text-center text-sm text-muted-foreground">{t("reports.noData", "No data for this period.")}</div>
                    ) : (
                      <>
                        {chartMeasure && labelCol && (
                          <div className="p-4 border-b border-border/60 space-y-1.5">
                            {result.rows.slice(0, 12).map((r, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <span className="w-32 shrink-0 truncate text-xs text-muted-foreground text-right">{fmt(r[labelCol.key], labelCol.format)}</span>
                                <div className="flex-1 h-5 rounded bg-muted overflow-hidden"><div className="h-full bg-primary/70 rounded" style={{ width: `${(Number(r[chartMeasure.key]) / maxVal) * 100}%` }} /></div>
                                <span className="w-20 shrink-0 text-xs font-medium tabular-nums text-right">{fmt(r[chartMeasure.key], chartMeasure.format)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="border-b border-border/60 text-left">{result.columns.map((c) => <th key={c.key} className={cn("px-4 py-2.5 text-xs font-semibold text-muted-foreground", c.kind === "measure" && "text-right")}>{c.label}</th>)}</tr></thead>
                            <tbody>{result.rows.map((r, i) => <tr key={i} className="border-b border-border/40 hover:bg-accent/20">{result.columns.map((c) => <td key={c.key} className={cn("px-4 py-2.5", c.kind === "measure" && "text-right tabular-nums font-medium")}>{fmt(r[c.key], c.format)}</td>)}</tr>)}</tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {!canBuild && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" />{t("reports.builderLocked", "Custom report builder is available on Professional and above.")}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{active?.savedId ? t("reports.update", "Update report") : t("reports.save", "Save report")}</DialogTitle></DialogHeader>
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
    </div>
  )
}
