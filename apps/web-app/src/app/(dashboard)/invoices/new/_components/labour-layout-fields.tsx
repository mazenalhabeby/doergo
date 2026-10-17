"use client"

import { useTranslation } from "react-i18next"
import type { LabourGrouping } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { LineStyle, WorkEntry } from "../_lib/draft-model"

/** Step 1, second half: how the labour is written up on the document. */
export function LabourLayoutFields({
  entries, grouping, setGrouping, siteMode, anyWorkRole, groupByRole, setGroupByRole, lineStyle, setLineStyle,
}: {
  entries: WorkEntry[]
  grouping: LabourGrouping
  setGrouping: (g: LabourGrouping) => void
  siteMode: boolean
  anyWorkRole: boolean
  groupByRole: boolean
  setGroupByRole: (v: boolean) => void
  lineStyle: LineStyle
  setLineStyle: (patch: Partial<LineStyle>) => void
}) {
  const { t } = useTranslation()
  return (
    <>
              {/*
                How the labour is written up — shown only once there is labour.

                ⚠️ All three price the same work identically where the hours are
                clean, so this is a choice about the DOCUMENT and never about the
                amount. Offering it before any work has been gathered would be a
                control with nothing to act on.
              */}
              {entries.some((e) => e.include && e.hours > 0) && (
                <div className="mt-4 border-t border-border pt-3">
                  <Label className="text-xs">{t("invoices.create.groupBy")}</Label>
                  <div className="mt-2 grid gap-1 rounded-xl border border-border bg-muted/50 p-1">
                    {([
                      ["task", t("invoices.create.groupByTask")],
                      ["member", t("invoices.create.groupByMember")],
                      ["both", t("invoices.create.groupByBoth")],
                    ] as const).filter(([key]) => !siteMode || key !== "task").map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setGrouping(key as LabourGrouping)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                          grouping === key
                            ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            : "border-border text-muted-foreground hover:border-slate-400",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {grouping === "task"
                      ? t("invoices.create.groupByTaskHint")
                      : grouping === "member"
                        ? t("invoices.create.groupByMemberHint")
                        : t("invoices.create.groupByBothHint")}
                  </p>
                </div>
              )}
              {/*
                Group under work roles — on/off per invoice, independent of how
                the labour is written up. Offered only where somebody has a
                trade; without one there is nothing to group by.
              */}
              {anyWorkRole && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="group-by-role" className="text-xs">{t("invoices.create.groupByRole")}</Label>
                    <Switch id="group-by-role" checked={groupByRole} onCheckedChange={setGroupByRole} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {groupByRole ? t("invoices.create.groupByRoleOn") : t("invoices.create.groupByRoleOff")}
                  </p>
                </div>
              )}
              {/*
                What a labour line says. The same words go onto the client's
                copy and the PDF — they ARE the line's text — and the tag choice
                is saved with the invoice.
              */}
              <div className="mt-4 space-y-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-foreground">{t("invoices.create.lineStyle")}</p>
                <div
                  role="radiogroup"
                  aria-label={t("invoices.create.lineStyle")}
                  className="grid gap-1 rounded-xl border border-border bg-muted/50 p-1">
                  {(["full", "name"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="radio"
                      aria-checked={lineStyle.words === w}
                      onClick={() => setLineStyle({ words: w })}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        lineStyle.words === w ? "bg-card shadow-sm" : "hover:bg-card/60",
                      )}
                    >
                      <span className="block text-xs font-semibold text-foreground">{t(`invoices.create.lineWords.${w}`)}</span>
                      <span className="block text-[11px] text-muted-foreground">{t(`invoices.create.lineWords.${w}Example`)}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="line-dates" className="text-xs">{t("invoices.create.lineDates")}</Label>
                  <Switch id="line-dates" checked={lineStyle.dates} onCheckedChange={(v) => setLineStyle({ dates: v })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="line-tags" className="text-xs">{t("invoices.create.lineTags")}</Label>
                  <Switch id="line-tags" checked={lineStyle.tags} onCheckedChange={(v) => setLineStyle({ tags: v })} />
                </div>
              </div>
    </>
  )
}
