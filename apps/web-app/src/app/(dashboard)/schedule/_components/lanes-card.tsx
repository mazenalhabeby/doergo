"use client"

import { personName } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import { type FloorPerson, type FloorSpace } from "@/lib/api"
import { cn } from "@/lib/utils"
import { byUsefulness, tally } from "../_lib/floor-view"
import { useLine, type Fmt } from "./use-floor-line"
import { Bar, Avatar, CardHead } from "./floor-card-common"

/** Lanes — everyone on the floor, grouped by what they are doing. */
export function LanesCard({ space, formatTime }: { space: FloorSpace; formatTime: Fmt }) {
  const { t } = useTranslation()
  const c = tally(space)
  const line = useLine(formatTime, space.timezone)
  const of = (...states: FloorPerson["state"][]) =>
    space.people.filter((p) => states.includes(p.state)).sort(byUsefulness)

  const lanes: Array<{ key: string; label: string; tone: string; people: FloorPerson[]; alarm?: boolean }> = [
    {
      key: "expected",
      label: t("cover.lane.notIn", "Not in"),
      tone: "text-red-600 dark:text-red-400",
      people: of("expected"),
      alarm: true,
    },
    {
      key: "working",
      label: t("cover.lane.free", "Free now"),
      tone: "text-emerald-600 dark:text-emerald-400",
      people: of("working"),
    },
    {
      key: "busy",
      label: t("cover.lane.onJob", "On a job"),
      tone: "text-blue-600 dark:text-blue-400",
      people: of("busy"),
    },
    {
      key: "break",
      label: t("cover.lane.break", "On a break"),
      tone: "text-amber-600 dark:text-amber-400",
      people: of("break"),
    },
    { key: "away", label: t("cover.lane.away", "Away"), tone: "text-muted-foreground", people: of("leave", "rest") },
  ]

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <CardHead space={space} c={c} />
      <div className="px-4 pb-3 pt-3">
        <Bar space={space} t={c} />
      </div>
      <div className="grid border-t border-border sm:grid-cols-2 lg:grid-cols-5">
        {lanes.map((lane) => (
          <div
            key={lane.key}
            className={cn(
              "min-w-0 border-b border-r border-border p-3 last:border-r-0",
              lane.alarm && lane.people.length > 0 && "bg-red-500/5",
            )}
          >
            <div
              className={cn("mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider", lane.tone)}
            >
              {lane.label}
              <span className="ml-auto tabular-nums">{lane.people.length}</span>
            </div>
            {lane.people.length ? (
              <div className="flex flex-col gap-2">
                {lane.people.map((p) => {
                  const l = line(p)
                  return (
                    <div key={p.id} className="flex min-w-0 items-center gap-2">
                      <Avatar person={p} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium leading-tight">{personName(p)}</span>
                        <span className={cn("block truncate text-[11px] leading-tight text-muted-foreground", l.tone)}>
                          {l.text}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <span className="text-[12px] italic text-muted-foreground/70">—</span>
            )}
          </div>
        ))}
      </div>
    </article>
  )
}
