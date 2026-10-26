"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import type { CalendarPlace } from "@hbcfield/shared/client"
import { ChevronLeft, ChevronRight, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/page/page-kit"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import type { CalendarView } from "../_lib/use-calendar"

const VIEWS: CalendarView[] = ["day", "week", "month", "agenda"]

/** The board's round icon button (previous / next). */
const ROUND_ICON =
  "grid size-[34px] shrink-0 place-items-center rounded-full bg-shell-chip text-foreground transition " +
  "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * The calendar's own bar (the board's `cxtop`): Today, previous / next, the period as a title with its week
 * number, and the views as a pill switch — plus Team, the way to the Schedule, for whoever may open it.
 */
export function CalendarToolbar({
  heading,
  week,
  view,
  setView,
  step,
  onToday,
  scheduleHref,
}: {
  heading: string
  week: number | null
  view: CalendarView
  setView: (v: CalendarView) => void
  step: (dir: -1 | 1) => void
  onToday: () => void
  /** Where Team leads; null when the reader may not open the Schedule. */
  scheduleHref: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" className="h-8 rounded-full px-3.5" onClick={onToday}>
        {t("calendar.today")}
      </Button>
      <button type="button" className={ROUND_ICON} aria-label={t("calendar.previous")} onClick={() => step(-1)}>
        <ChevronLeft className="size-4" />
      </button>
      <button type="button" className={ROUND_ICON} aria-label={t("calendar.next")} onClick={() => step(1)}>
        <ChevronRight className="size-4" />
      </button>
      <h2 className="mx-1.5 text-xl font-semibold tracking-[-0.02em] text-foreground">{heading}</h2>
      {week && <Chip className="tabular-nums">{t("calendar.weekNo", { n: week })}</Chip>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex gap-0.5 rounded-full bg-shell-chip p-1">
          {VIEWS.map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "h-8 rounded-full px-3.5 text-[13.5px] font-medium text-muted-foreground transition",
                view === v && "bg-card font-semibold text-foreground shadow-shell",
              )}
            >
              {t(`calendar.view.${v}`)}
            </button>
          ))}
          {scheduleHref && (
            <Link
              href={scheduleHref}
              className={
                "inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-[13.5px] " +
                "font-medium text-muted-foreground transition hover:text-foreground"
              }
            >
              <Users className="h-3.5 w-3.5" />
              {t("calendar.view.team")}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

/** Each place's weekend (and holiday region) as chips — one chip when every place agrees. */
export function PlacesLine({ places }: { places: CalendarPlace[] }) {
  const { t } = useTranslation()
  const wk = (p: CalendarPlace) =>
    [...p.weekend]
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
      .map((d) => new Date(2026, 1, 1 + d).toLocaleDateString(dateLocale(), { weekday: "short" }))
      .join(" · ")
  const first = places[0]!
  const same = places.every((p) => wk(p) === wk(first) && p.country === first.country && p.region === first.region)
  const list = same ? [first] : places
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((p) => (
        <Chip key={p.spaceId ?? "org"}>
          {!same && <span className="font-semibold text-foreground">{p.name}</span>}
          {t("calendar.weekendIs", { days: wk(p) })}
          {p.country && (
            <span className="font-mono text-[10.5px]">
              {p.country}
              {p.region ? `-${p.region}` : ""}
            </span>
          )}
        </Chip>
      ))}
    </div>
  )
}
