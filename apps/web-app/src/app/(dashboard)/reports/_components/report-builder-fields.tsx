"use client"

import { type DatasetMeta } from "@/lib/api"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { personName, reportLabel } from "@hbcfield/shared/client"
import { TIMESHEET_COLS, TIMESHEET_LABEL } from "./report-options"
import type { ActiveReport, ReportBuilder } from "../_hooks/use-report-builder"
import { ChoiceChip } from "@/components/ui/choice-chip"
import { Segmented } from "@/components/ui/segmented"
import { useTranslation } from "react-i18next"

type ReportBuilderFieldsProps = Pick<
  ReportBuilder,
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
> & {
  active: ActiveReport
  dsMeta: DatasetMeta
}

/** The builder's fields: dataset, summary or day-by-day, then measures and grouping — or the person and the columns. */
export function ReportBuilderFields({
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
}: ReportBuilderFieldsProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return (
    <div className="p-4 space-y-3">
      {/* Dataset */}
      <div data-tour="reports-dataset" className="flex items-center gap-3">
        <Label className="text-xs w-20 shrink-0">{t("reports.dataset", "Dataset")}</Label>
        <Select
          value={active.def.dataset}
          onValueChange={(v) => {
            const d = datasets.find((x) => x.key === v)
            setActive((a) =>
              a
                ? {
                    ...a,
                    detail: false,
                    def: {
                      ...a.def,
                      dataset: v,
                      measures: d?.measures[0] ? [d.measures[0].key] : [],
                      dimensions: [],
                      filters: [],
                    },
                  }
                : a,
            )
          }}
        >
          <SelectTrigger className="h-9 w-[220px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {datasets.map((d) => (
              <SelectItem key={d.key} value={d.key} className="text-xs">
                {reportLabel(lang, d.labelKey, d.label)}
              </SelectItem>
            ))}
          </SelectContent>
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
          {isDetail && (
            <span className="text-[11px] text-muted-foreground">
              {t("reports.detailHint", "Day-by-day clock-in/out for one person")}
            </span>
          )}
        </div>
      )}

      {isDetail ? (
        /* Detailed timesheet: pick the user + columns */
        <>
          <div className="flex items-center gap-3">
            <Label className="text-xs w-20 shrink-0">{t("reports.user", "User")}</Label>
            <Select value={active.userId ?? ""} onValueChange={(v) => setActive((a) => (a ? { ...a, userId: v } : a))}>
              <SelectTrigger className="h-9 w-[240px] text-xs">
                <SelectValue placeholder={t("reports.pickUser", "Select a technician…")} />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {personName(m)}
                  </SelectItem>
                ))}
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
                    onClick={() =>
                      setTsCols((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]))
                    }
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
                return (
                  <ChoiceChip key={m.key} on={on} onClick={() => toggleArr("measures", m.key)}>
                    {reportLabel(lang, m.labelKey, m.label)}
                  </ChoiceChip>
                )
              })}
            </div>
          </div>
          <div data-tour="reports-dimensions" className="flex items-start gap-3">
            <Label className="text-xs w-20 shrink-0 pt-1.5">{t("reports.groupByDim", "Group by")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {dsMeta.dimensions.map((dim) => {
                const on = (active.def.dimensions || []).includes(dim.key)
                return (
                  <ChoiceChip key={dim.key} on={on} onClick={() => toggleArr("dimensions", dim.key)}>
                    {reportLabel(lang, dim.labelKey, dim.label)}
                  </ChoiceChip>
                )
              })}
            </div>
          </div>
          {/* Scope to one customer → the export becomes their statement. */}
          {hasCustomerDim && (
            <div className="flex items-center gap-3">
              <Label className="text-xs w-20 shrink-0">{t("reports.customer", "Customer")}</Label>
              <Select
                value={customerFilter ?? "__all__"}
                onValueChange={(v) => setCustomerFilter(v === "__all__" ? undefined : v)}
              >
                <SelectTrigger className="h-9 w-[220px] text-xs">
                  <SelectValue placeholder={t("reports.allCustomers", "All customers")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs">
                    {t("reports.allCustomers", "All customers")}
                  </SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.name} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customerFilter && (
                <span className="text-[11px] text-muted-foreground">
                  {t("reports.customerScoped", "Export shows this customer's details")}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
