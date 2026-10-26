"use client"

import { Play } from "lucide-react"
import { type ReportDatePreset, type ReportGranularity } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/page/page-kit"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toISODateString } from "@hbcfield/shared/client"
import { DATE_PRESETS, GRANULARITIES } from "./report-options"
import { ReportBuilderFields } from "./report-builder-fields"
import type { ActiveReport, ReportBuilder } from "../_hooks/use-report-builder"
import { useTranslation } from "react-i18next"

type ReportConfigProps = Pick<
  ReportBuilder,
  | "dsMeta"
  | "datasets"
  | "setActive"
  | "isAttendance"
  | "isDetail"
  | "members"
  | "tsCols"
  | "setTsCols"
  | "toggleArr"
  | "hasCustomerDim"
  | "customerFilter"
  | "setCustomerFilter"
  | "customers"
  | "patchDef"
  | "runTimesheet"
> & {
  active: ActiveReport
  runPending: boolean
  timesheetPending: boolean
  onRun: () => void
}

/** Configure & run: the builder's fields (dataset, view, measures, grouping, customer), then the period and Run. */
export function ReportConfig({
  active,
  dsMeta,
  datasets,
  setActive,
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
  patchDef,
  runTimesheet,
  runPending,
  timesheetPending,
  onRun,
}: ReportConfigProps) {
  const { t } = useTranslation()
  // Period control: "custom" when an explicit from/to range is set.
  const isCustomRange = !!(active.def.dateRange?.from || active.def.dateRange?.to)
  const toDateInput = (iso?: string) => (iso ? toISODateString(new Date(iso)) : "")
  const supportsTime = active.def.granularity !== undefined

  return (
    <Panel className="divide-y divide-border p-0">
      {/* Builder fields */}
      {active.builder && dsMeta && (
        <ReportBuilderFields
          active={active}
          dsMeta={dsMeta}
          datasets={datasets}
          setActive={setActive}
          isAttendance={isAttendance}
          isDetail={isDetail}
          members={members}
          tsCols={tsCols}
          setTsCols={setTsCols}
          toggleArr={toggleArr}
          hasCustomerDim={hasCustomerDim}
          customerFilter={customerFilter}
          setCustomerFilter={setCustomerFilter}
          customers={customers}
        />
      )}

      {/* Period / time split + Run */}
      <div data-tour="reports-period" className="flex flex-wrap items-end gap-3 p-[18px]">
        <div className="space-y-1.5">
          <label className="text-[12.5px] font-semibold text-muted-foreground">{t("reports.period", "Period")}</label>
          <Select
            value={isCustomRange ? "__custom__" : active.def.dateRange?.preset || "last_30d"}
            onValueChange={(v) => {
              if (v === "__custom__") {
                const to = new Date()
                const from = new Date(to.getTime() - 30 * 86400000)
                patchDef({ dateRange: { from: from.toISOString(), to: to.toISOString() } })
              } else patchDef({ dateRange: { preset: v as ReportDatePreset } })
            }}
          >
            <SelectTrigger className="h-10 w-[170px] rounded-xl text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value="__custom__" className="text-xs">
                {t("reports.customRange", "Custom range…")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isCustomRange && (
          <>
            <div className="space-y-1.5">
              <label className="text-[12.5px] font-semibold text-muted-foreground">{t("reports.from", "From")}</label>
              <DatePicker
                value={toDateInput(active.def.dateRange?.from)}
                max={toDateInput(active.def.dateRange?.to) || undefined}
                onChange={(day) =>
                  patchDef({
                    dateRange: {
                      ...active.def.dateRange,
                      from: day ? new Date(day).toISOString() : undefined,
                    },
                  })
                }
                clearable
                aria-label={t("reports.from", "From")}
                className="w-[150px]"
                triggerClassName="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12.5px] font-semibold text-muted-foreground">{t("reports.to", "To")}</label>
              <DatePicker
                value={toDateInput(active.def.dateRange?.to)}
                min={toDateInput(active.def.dateRange?.from) || undefined}
                onChange={(day) =>
                  patchDef({
                    dateRange: {
                      ...active.def.dateRange,
                      to: day ? new Date(day + "T23:59:59").toISOString() : undefined,
                    },
                  })
                }
                clearable
                aria-label={t("reports.to", "To")}
                className="w-[150px]"
                triggerClassName="text-xs"
              />
            </div>
          </>
        )}
        {!isDetail && supportsTime && (
          <div className="space-y-1.5">
            <label className="text-[12.5px] font-semibold text-muted-foreground">
              {t("reports.timeSplit", "Time split")}
            </label>
            <Select
              value={active.def.granularity || "none"}
              onValueChange={(v) => patchDef({ granularity: v as ReportGranularity })}
            >
              <SelectTrigger className="h-10 w-[160px] rounded-xl text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRANULARITIES.map((g) => (
                  <SelectItem key={g.value} value={g.value} className="text-xs">
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {isDetail ? (
          <Button
            data-tour="reports-run"
            size="pill"
            className="ml-auto"
            disabled={timesheetPending || !active.userId}
            onClick={runTimesheet}
          >
            <Play className="h-3.5 w-3.5" />
            {timesheetPending ? t("reports.running", "Running…") : t("reports.run", "Run report")}
          </Button>
        ) : (
          <Button
            data-tour="reports-run"
            size="pill"
            className="ml-auto"
            disabled={runPending || !active.def.measures?.length}
            onClick={onRun}
          >
            <Play className="h-3.5 w-3.5" />
            {runPending ? t("reports.running", "Running…") : t("reports.run", "Run report")}
          </Button>
        )}
      </div>
    </Panel>
  )
}
