"use client"

import { Play } from "lucide-react"
import { type ReportDatePreset, type ReportGranularity } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { personName, reportLabel } from "@hbcfield/shared/client"
import { DATE_PRESETS } from "../_hooks/use-reports-page"
import { GRANULARITIES, TIMESHEET_COLS, TIMESHEET_LABEL } from "./reports-page-helpers"
import type { ReportsPageState } from "../_hooks/use-reports-page"
import { ChoiceChip } from "@/components/ui/choice-chip"
import { Segmented } from "@/components/ui/segmented"

/** Part of ReportsPage's markup, moved here unchanged; it reads the page's state from `s`. */
export function ReportsPageDataset({ s }: { s: ReportsPageState }) {
  const {
    active,
    dsMeta,
    t,
    datasets,
    setActive,
    lang,
    isAttendance,
    isDetail,
    members,
    tsCols,
    setTsCols,
    toggleArr,
    hasCustomerDim,
    customerFilter,
    setCustomerFilter,
    customers,
    isCustomRange,
    patchDef,
    toDateInput,
    supportsTime,
    timesheet,
    runTimesheet,
    run,
  } = s
  if ((!active)) return null
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none dark:border-white/[0.08] divide-y divide-border/60">
      {/* Builder fields */}
      {active.builder && dsMeta && (
        <div className="p-4 space-y-3">
          {/* Dataset */}
          <div data-tour="reports-dataset" className="flex items-center gap-3">
            <Label className="text-xs w-20 shrink-0">{t("reports.dataset", "Dataset")}</Label>
            <Select
              value={active.def.dataset}
              onValueChange={(v) => { const d = datasets.find((x) => x.key === v); setActive((a) => (a
                ? {
                  ...a,
                  detail: false,
                  def: { ...a.def, dataset: v, measures: d?.measures[0] ? [d.measures[0].key] : [], dimensions: [], filters: [] }
                }
                : a)) }}>
              <SelectTrigger className="h-9 w-[220px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{datasets.map((d) => <SelectItem
                key={d.key}
                value={d.key}
                className="text-xs">{reportLabel(lang, d.labelKey, d.label)}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Attendance-only: Summary vs Detailed (day-by-day per user) */}
          {isAttendance && (
            <div className="flex items-center gap-3">
              <Label className="text-xs w-20 shrink-0">{t("reports.view", "View")}</Label>
              <Segmented
                ariaLabel={t("reports.view", "View")}
                value={isDetail ? "detail" : "summary"}
                onChange={(v) => setActive((a) => (a ? { ...a, detail: v === "detail" } : a))}
                options={[
                  { value: "summary", label: t("reports.view_summary", "Summary") },
                  { value: "detail", label: t("reports.view_detail", "Detailed") },
                ]}
              />
              {isDetail &&
                <span
                  className="text-[11px] text-muted-foreground">{t("reports.detailHint", "Day-by-day clock-in/out for one person")}</span>}
            </div>
          )}

          {isDetail ? (
            /* Detailed timesheet: pick the user + columns */
            <>
              <div className="flex items-center gap-3">
                <Label className="text-xs w-20 shrink-0">{t("reports.user", "User")}</Label>
                <Select value={active.userId ?? ""} onValueChange={(v) => setActive((a) => (a ? { ...a, userId: v } : a))}>
                  <SelectTrigger
                    className="h-9 w-[240px] text-xs"><SelectValue
                      placeholder={t("reports.pickUser", "Select a technician…")}
                    /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => <SelectItem key={m.id} value={m.id} className="text-xs">{personName(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-3">
                <Label className="text-xs w-20 shrink-0 pt-1.5">{t("reports.columns", "Columns")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TIMESHEET_COLS.map((key) => {
                    const on = tsCols.includes(key)
                    // Keep at least one column so the report is never empty.
                    const isLast = on && tsCols.length === 1
                    return (
                      <ChoiceChip
                        key={key}
                        on={on}
                        disabled={isLast}
                        onClick={() => setTsCols((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]))}
                        className={isLast ? "cursor-default" : undefined}
                      >
                        {reportLabel(lang, TIMESHEET_LABEL[key] ?? `col.${key}`, key)}
                      </ChoiceChip>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              <div data-tour="reports-measures" className="flex items-start gap-3">
                <Label className="text-xs w-20 shrink-0 pt-1.5">{t("reports.measures", "Measures")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {dsMeta.measures.map((m) => {
                    const on = (active.def.measures || []).includes(m.key)
                    return <ChoiceChip key={m.key} on={on} onClick={() => toggleArr("measures", m.key)}>
                      {reportLabel(lang, m.labelKey, m.label)}
                    </ChoiceChip>
                  })}
                </div>
              </div>
              <div data-tour="reports-dimensions" className="flex items-start gap-3">
                <Label className="text-xs w-20 shrink-0 pt-1.5">{t("reports.groupByDim", "Group by")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {dsMeta.dimensions.map((dim) => {
                    const on = (active.def.dimensions || []).includes(dim.key)
                    return <ChoiceChip key={dim.key} on={on} onClick={() => toggleArr("dimensions", dim.key)}>
                      {reportLabel(lang, dim.labelKey, dim.label)}
                    </ChoiceChip>
                  })}
                </div>
              </div>
              {/* Scope to one customer → the export becomes their statement. */}
              {hasCustomerDim && (
                <div className="flex items-center gap-3">
                  <Label className="text-xs w-20 shrink-0">{t("reports.customer", "Customer")}</Label>
                  <Select value={customerFilter ?? "__all__"} onValueChange={(v) => setCustomerFilter(v === "__all__" ? undefined : v)}>
                    <SelectTrigger
                      className="h-9 w-[220px] text-xs"><SelectValue
                        placeholder={t("reports.allCustomers", "All customers")}
                      /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__" className="text-xs">{t("reports.allCustomers", "All customers")}</SelectItem>
                      {customers.map((c) => <SelectItem key={c.id} value={c.name} className="text-xs">{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {customerFilter &&
                    <span
                      className="text-[11px] text-muted-foreground">{t(
                        "reports.customerScoped",
                        "Export shows this customer's details")}</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Period / time split + Run */}
      <div data-tour="reports-period" className="flex flex-wrap items-end gap-3 p-4">
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
                onChange={(e) => patchDef({
                  dateRange: { ...active.def.dateRange, from: e.target.value ? new Date(e.target.value).toISOString() : undefined }
                })}
                className="h-9 w-[150px] text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t("reports.to", "To")}</label>
              <Input type="date" value={toDateInput(active.def.dateRange?.to)} min={toDateInput(active.def.dateRange?.from) || undefined}
                onChange={(e) => patchDef({
                  dateRange: {
                    ...active.def.dateRange,
                    to: e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : undefined
                  }
                })}
                className="h-9 w-[150px] text-xs" />
            </div>
          </>
        )}
        {!isDetail && supportsTime && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("reports.timeSplit", "Time split")}</label>
            <Select value={active.def.granularity || "none"} onValueChange={(v) => patchDef({ granularity: v as ReportGranularity })}>
              <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{GRANULARITIES.map((g) => <SelectItem
                key={g.value}
                value={g.value}
                className="text-xs">{g.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {isDetail ? (
          <Button
            data-tour="reports-run"
            className="gap-1.5 h-9 ml-auto"
            disabled={timesheet.isPending || !active.userId}
            onClick={runTimesheet}>
            <Play className="h-3.5 w-3.5" />{timesheet.isPending ? t("reports.running", "Running…") : t("reports.run", "Run report")}
          </Button>
        ) : (
          <Button
            data-tour="reports-run"
            className="gap-1.5 h-9 ml-auto"
            disabled={run.isPending || !(active.def.measures?.length)}
            onClick={() => run.mutate(active.def)}>
            <Play className="h-3.5 w-3.5" />{run.isPending ? t("reports.running", "Running…") : t("reports.run", "Run report")}
          </Button>
        )}
      </div>
    </div>
  )
}
