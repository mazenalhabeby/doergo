"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { Clock, CalendarDays } from "lucide-react"
import { formatHoursMinutes } from "@hbcfield/shared/client"

import { formatDayKey } from "@/lib/day-key"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { money } from "../../_components/invoice-document"
import type { DayRun, HourRun } from "../_lib/draft-model"
import { HoursBasisChip } from "./hours-basis-chip"

/** Hours on site and days worked, one row per run at one rate — exactly as they become lines. */
export function WorkRuns({
  dayRuns, hourRuns, setDayRuns, setHourRuns, currency, gatherSpaceId,
}: {
  dayRuns: DayRun[]
  hourRuns: HourRun[]
  setDayRuns: Dispatch<SetStateAction<DayRun[]>>
  setHourRuns: Dispatch<SetStateAction<HourRun[]>>
  currency: string
  gatherSpaceId: string | null | undefined
}) {
  const { t, i18n } = useTranslation()
  return (
    <>
            {/*
              Days worked — for people billed by the day. One row per run at one
              day rate, so a rate change inside the period is two rows here
              exactly as it is two lines on the invoice.
            */}
            {hourRuns.length > 0 && (
              <div className="mt-3 space-y-2">
                {hourRuns.map((h) => (
                  <div
                    key={h.key}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors",
                      h.include ? "border-border" : "border-border/40 opacity-60")}
                  >
                    <Checkbox
                      checked={h.include}
                      onCheckedChange={(v) => setHourRuns((prev) => prev.map((x) => (x.key === h.key ? { ...x, include: !!v } : x)))}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-foreground">
                          <span
                            className={"mr-2 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold " +
                              "text-blue-700 dark:text-blue-300"}>{t("invoices.create.tagHours")}</span>
                          {h.workerName}
                          {h.workRoleName && <span className="ml-2 text-xs font-normal text-muted-foreground">{h.workRoleName}</span>}
                          <HoursBasisChip
                            basis={h.hoursBasis}
                            hoursByBasis={h.hoursByBasis}
                            spaceId={gatherSpaceId}
                            assignmentId={h.assignmentId}
                          />
                        </p>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {money(Math.round(h.hours * (h.hourRateCents ?? 0)) / 100, currency)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {t(
                            "invoices.create.hoursOnSite",
                            { hours: formatHoursMinutes(h.hours), days: h.days })} × {money((h.hourRateCents ?? 0) / 100, currency)}
                        </span>
                        <span>
                          {formatDayKey(h.fromDay, i18n.language)}
                          {h.toDay !== h.fromDay && ` – ${formatDayKey(h.toDay, i18n.language)}`}
                        </span>
                      </div>
                      {(h.noShiftDays ?? 0) > 0 && (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                          {t("invoices.create.noShiftDays", { count: h.noShiftDays })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {dayRuns.length > 0 && (
              <div className="mt-3 space-y-2">
                {dayRuns.map((d) => (
                  <div
                    key={d.key}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors",
                      d.include ? "border-border" : "border-border/40 opacity-60")}
                  >
                    <Checkbox
                      checked={d.include}
                      onCheckedChange={(v) => setDayRuns((prev) => prev.map((x) => (x.key === d.key ? { ...x, include: !!v } : x)))}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-foreground">
                          <span
                            className={"mr-2 rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-bold " +
                              "text-teal-700 dark:text-teal-300"}>{t("invoices.create.tagDays")}</span>
                          {d.workerName}
                          {d.workRoleName && <span className="ml-2 text-xs font-normal text-muted-foreground">{d.workRoleName}</span>}
                        </p>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {money(((d.dayRateCents ?? 0) * d.days) / 100, currency)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3" />
                          {t("invoices.create.daysWorked", { count: d.days })} × {money((d.dayRateCents ?? 0) / 100, currency)}
                        </span>
                        <span>
                          {formatDayKey(d.fromDay, i18n.language)}
                          {d.toDay !== d.fromDay && ` – ${formatDayKey(d.toDay, i18n.language)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
    </>
  )
}
