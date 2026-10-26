"use client"

import { personName } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import { type FloorPerson, type FloorSpace } from "@/lib/api"
import { cn } from "@/lib/utils"
import { CRIT_SOFT } from "@/components/attendance/time-styles"
import { LATE_TEXT, byUsefulness, isExpected, isPresent, lateness, tally } from "../_lib/floor-view"
import { useLine, type Fmt } from "./use-floor-line"
import { Bar, Avatar, CardHead } from "./floor-card-common"

/** Exceptions first — a verdict, then only what is wrong. */
export function ExceptionsCard({ space, formatTime }: { space: FloorSpace; formatTime: Fmt }) {
  const { t } = useTranslation()
  const c = tally(space)
  const line = useLine(formatTime, space.timezone)

  // Only somebody actually overdue is an exception. Due in ten minutes is not
  // an incident, and treating it as one teaches people to ignore the panel.
  const overdue = space.people
    .filter((p) => {
      const l = lateness(p)
      return l && l.minutes >= 5
    })
    .sort(byUsefulness)

  const here = space.people.filter(isPresent).sort(byUsefulness)
  const soon = space.people.filter((p) => p.state === "expected" && !overdue.includes(p))
  const away = space.people.filter((p) => !isExpected(p))
  const good = overdue.length === 0 && space.status !== "short"

  return (
    <article className="overflow-hidden rounded-[22px] border border-border bg-card shadow-shell">
      <CardHead space={space} c={c} />

      <div className="px-4 pb-3.5 pt-3">
        <div
          className={cn(
            "mb-3 flex items-center gap-2.5 text-[14px] font-semibold tracking-tight",
            good ? "text-shell-accent" : "text-shell-crit",
          )}
        >
          <span
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[13px] font-extrabold",
              good ? "bg-shell-accent-soft" : "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)]",
            )}
            aria-hidden
          >
            {good ? "✓" : "▲"}
          </span>
          {good
            ? t("cover.floorNow.allHere", "Everyone expected is here")
            : space.status === "short"
              ? t("cover.floor.short", "{{n}} under minimum", { n: space.minCover - c.here })
              : t("cover.floorNow.notIn", "{{count}} has not clocked in", { count: overdue.length })}
        </div>
        <Bar space={space} t={c} />
      </div>

      {overdue.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pb-3">
          {overdue.map((p) => {
            const l = lateness(p)!
            return (
              <div key={p.id} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5", CRIT_SOFT)}>
                <Avatar person={p} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold tracking-tight">{personName(p)}</span>
                  <span className={cn("text-[12px] font-medium", LATE_TEXT[l.tone])}>
                    {p.trade ? `${p.trade} · ` : ""}
                    {line(p).text}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <WorkingNow here={here} soon={soon} away={away} line={line} />
    </article>
  )
}

type WorkingNowProps = {
  here: FloorPerson[]
  soon: FloorPerson[]
  away: FloorPerson[]
  line: ReturnType<typeof useLine>
}

/** Who is working now, then how many are due shortly and who is not expected today. */
function WorkingNow({ here, soon, away, line }: WorkingNowProps) {
  const { t } = useTranslation()
  return (
    <div className="border-t border-border px-4 py-3">
      <h4 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {t("cover.floorNow.working", "Working")}
        <span className="tabular-nums text-muted-foreground/80">{here.length}</span>
      </h4>
      {here.length ? (
        <div className="flex flex-wrap gap-2">
          {here.map((p) => {
            const l = line(p)
            return (
              <span
                key={p.id}
                className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-1.5 pr-3"
                title={`${personName(p)}${p.trade ? ` · ${p.trade}` : ""} — ${l.text}`}
              >
                <Avatar person={p} />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium leading-tight">{personName(p)}</span>
                  <span
                    className={cn(
                      "block max-w-[16ch] truncate text-[10.5px] leading-tight text-muted-foreground",
                      l.tone,
                    )}
                  >
                    {l.text}
                  </span>
                </span>
              </span>
            )
          })}
        </div>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">
          {t("cover.floorNow.nobodyIn", "Nobody has clocked in yet.")}
        </p>
      )}

      {(soon.length > 0 || away.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          {soon.length > 0 && (
            <span>{t("cover.floorNow.dueSoon", "{{count}} due shortly", { count: soon.length })}</span>
          )}
          {away.length > 0 && (
            <>
              <span>{t("cover.floorNow.notExpected", "Not expected today:")}</span>
              {away.map((p) => (
                <span
                  key={p.id}
                  className={
                    "inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 py-0.5 " +
                    "pl-0.5 pr-2.5 text-[11.5px] font-medium text-violet-700 " +
                    "dark:text-violet-300"
                  }
                >
                  <Avatar person={p} />
                  {p.firstName}
                  {p.leaveUntil ? ` · ${t("cover.floorNow.back", "back {{date}}", { date: p.leaveUntil })}` : ""}
                </span>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
