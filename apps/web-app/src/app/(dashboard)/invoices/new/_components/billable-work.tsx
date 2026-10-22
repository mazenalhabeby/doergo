"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { Clock, Package, FileText, ChevronDown, ChevronRight } from "lucide-react"
import { personInitials } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { money, fmtDate } from "../../_components/invoice-document"
import type { DayRun, HourRun, WorkEntry } from "../_lib/draft-model"
import { WorkRuns } from "./work-runs"

/** Step 4 — the completed, unbilled work gathered from the workspace, to tick in or out. */
export function BillableWork({
  entries,
  dayRuns,
  hourRuns,
  setDayRuns,
  setHourRuns,
  setEntry,
  gatherLoading,
  includedCount,
  currency,
  entryRate,
  entryLabor,
  entryParts,
  gatherSpaceId,
}: {
  entries: WorkEntry[]
  dayRuns: DayRun[]
  hourRuns: HourRun[]
  setDayRuns: Dispatch<SetStateAction<DayRun[]>>
  setHourRuns: Dispatch<SetStateAction<HourRun[]>>
  setEntry: (taskId: string, patch: Partial<WorkEntry>) => void
  gatherLoading: boolean
  includedCount: number
  currency: string
  entryRate: (e: WorkEntry) => number
  entryLabor: (e: WorkEntry) => number
  entryParts: (e: WorkEntry) => number
  gatherSpaceId: string | null | undefined
}) {
  const { t } = useTranslation()
  // Which jobs show their parts — this list's own business.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="flex items-center gap-2.5">
          <span
            className={
              "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted " +
              "text-[10px] font-semibold tabular-nums text-muted-foreground"
            }
          >
            4
          </span>
          <span className="text-sm font-semibold text-foreground">{t("invoices.create.billableWork")}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {t("invoices.create.jobsSelected", { count: includedCount, total: entries.length })}
        </span>
      </div>

      {gatherLoading ? (
        <div className="space-y-3">
          {Array.from({
            length: 3,
          }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 && dayRuns.length === 0 && hourRuns.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border text-center py-12">
          <FileText className="size-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">{t("invoices.create.noWork")}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t("invoices.create.noWorkHint")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => {
            const open = expanded[e.taskId]
            const lineTotal = entryLabor(e) + entryParts(e)
            return (
              <div
                key={e.taskId}
                className={cn(
                  "bg-card rounded-xl border transition-colors",
                  e.include ? "border-border" : "border-border/40 opacity-60",
                )}
              >
                <div className="flex items-start gap-3 p-4">
                  <Checkbox
                    checked={e.include}
                    onCheckedChange={(v) => setEntry(e.taskId, { include: !!v })}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground truncate">{e.taskTitle}</p>
                      <span className="text-sm font-semibold tabular-nums shrink-0">{money(lineTotal, currency)}</span>
                    </div>
                    {/* worker · hours · date chips */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className={
                            "size-5 rounded-full bg-brand-600/15 text-brand-700 dark:text-brand-300 " +
                            "text-[9px] font-semibold flex items-center justify-center"
                          }
                        >
                          {personInitials(e.workerName)}
                        </span>
                        {e.workerName || t("invoices.create.unassignedWorker")}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        <input
                          type="number"
                          min={0}
                          step="0.25"
                          value={e.hours}
                          onChange={(ev) => setEntry(e.taskId, { hours: Number(ev.target.value) })}
                          className={
                            "w-14 bg-transparent border-b border-dashed border-border " +
                            "focus:border-brand-600 outline-none text-xs tabular-nums text-foreground"
                          }
                        />{" "}
                        h × {money(entryRate(e), currency)}
                      </span>
                      <span>{fmtDate(e.completedAt)}</span>
                      {e.parts.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Package className="size-3" /> {t("invoices.create.partsCount", { count: e.parts.length })}
                        </span>
                      )}
                    </div>
                    {/* notes preview */}
                    {e.notes && <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2">{e.notes}</p>}
                    {/* expand for parts / full notes */}
                    {(e.parts.length > 0 || (e.notes && e.notes.length > 120)) && (
                      <button
                        onClick={() => setExpanded((p) => ({ ...p, [e.taskId]: !open }))}
                        className={
                          "mt-2 inline-flex items-center gap-1 text-[11px] text-brand-600 " + "hover:underline"
                        }
                      >
                        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                        {open ? t("invoices.create.hideDetails") : t("invoices.create.showDetails")}
                      </button>
                    )}
                    {open && (
                      <div className="mt-2 space-y-2">
                        {e.notes && (
                          <p
                            className={
                              "text-xs text-muted-foreground whitespace-pre-line rounded-lg bg-muted/40 " + "p-2.5"
                            }
                          >
                            {e.notes}
                          </p>
                        )}
                        {e.parts.length > 0 && (
                          <div className="rounded-lg border border-border/60 overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30">
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {t("invoices.create.parts")}
                              </span>
                              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                                <Checkbox
                                  checked={e.includeParts}
                                  onCheckedChange={(v) => setEntry(e.taskId, { includeParts: !!v })}
                                  className="size-3.5"
                                />
                                {t("invoices.create.billParts")}
                              </label>
                            </div>
                            {e.parts.map((p, i) => (
                              <div
                                key={i}
                                className={
                                  "flex items-center justify-between px-3 py-1.5 text-xs border-t " + "border-border/40"
                                }
                              >
                                <span className="text-foreground">
                                  {p.name}
                                  {p.partNumber ? ` (${p.partNumber})` : ""}
                                </span>
                                <span className="text-muted-foreground tabular-nums">
                                  {p.quantity} × {money(p.unitCost, currency)} ={" "}
                                  {money(p.quantity * p.unitCost, currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <WorkRuns
        dayRuns={dayRuns}
        hourRuns={hourRuns}
        setDayRuns={setDayRuns}
        setHourRuns={setHourRuns}
        currency={currency}
        gatherSpaceId={gatherSpaceId}
      />
    </div>
  )
}
