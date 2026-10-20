"use client"

import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { type CoverRangeSpace } from "./leave-wallchart-days"
import type { TFunction } from "i18next"

/** The foot of a workspace block: how many are on the floor each day, then the verdict. The markup is moved here unchanged;
 *  SpaceBlock works the values out after its early return and passes them in. */
export function SpaceCoverFooter({
  minCover,
  days,
  template,
  cover,
  t,
  isWeekend,
  dayCover,
  projected,
}: {
  minCover: number
  days: Date[]
  template: React.CSSProperties
  cover: CoverRangeSpace
  t: TFunction
  isWeekend: (d: Date) => boolean
  dayCover: Map<string, CoverRangeSpace["days"][number]>
  projected: (dayKey: string, working: number) => number | null
}) {
  return (
    <>
      <div className="grid border-t border-border bg-muted/50" style={template}>
        <div
          className={"sticky left-0 z-10 flex items-center gap-1.5 border-r border-border " +
            "bg-muted/50 px-3 py-1.5 text-[11.5px] font-semibold " +
            "text-muted-foreground"}>
          {t("cover.chart.onFloor", "On the floor")}
        </div>
        {days.map((d) => {
          const k = format(d, "yyyy-MM-dd")
          const info = dayCover.get(k)
          const proj = info ? projected(k, info.working) : null
          if (!info || info.rostered === 0) {
            return (
              <div
                key={k}
                className={cn(
                  "border-l border-border py-1.5 text-center text-xs text-muted-foreground/50",
                  isWeekend(d) && "bg-muted",
                )}
              >
                —
              </div>
            )
          }
          const short = minCover > 0 && info.working < minCover
          const tight = minCover > 0 && info.working === minCover
          return (
            <div
              key={k}
              className={cn(
                "border-l border-border py-1 text-center text-xs tabular-nums",
                isWeekend(d) && "bg-muted",
                short
                  ? "font-bold text-red-600 dark:text-red-400"
                  : tight
                    ? "font-bold text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
              )}
            >
              {info.working}
              {proj !== null && proj !== info.working && (
                <span
                  className={cn(
                    "block text-[10px] font-bold leading-tight",
                    minCover > 0 && proj < minCover ? "text-red-600 dark:text-red-400" : "text-primary",
                  )}
                >
                  → {proj}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {minCover > 0 && (
        <div className="grid border-t border-border bg-muted/50" style={template}>
          <div
            className={"sticky left-0 z-10 flex items-center border-r border-border bg-muted/50 " +
              "px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground"}>
            {t("cover.chart.againstMinimum", "Against minimum {{n}}", { n: minCover })}
          </div>
          {days.map((d) => {
            const k = format(d, "yyyy-MM-dd")
            const info = dayCover.get(k)
            if (!info || info.rostered === 0) {
              return (
                <div
                  key={k}
                  className={cn(
                    "border-l border-border py-1 text-center text-xs text-muted-foreground/40",
                    isWeekend(d) && "bg-muted",
                  )}
                >
                  ·
                </div>
              )
            }
            const n = projected(k, info.working) ?? info.working
            const mark = n < minCover ? "▲" : n === minCover ? "!" : "✓"
            return (
              <div
                key={k}
                className={cn(
                  "border-l border-border py-1 text-center text-xs",
                  isWeekend(d) && "bg-muted",
                  n < minCover
                    ? "font-bold text-red-600 dark:text-red-400"
                    : n === minCover
                      ? "font-bold text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {mark}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
