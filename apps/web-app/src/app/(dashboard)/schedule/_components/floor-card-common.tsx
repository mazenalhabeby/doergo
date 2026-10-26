"use client"

import { useTranslation } from "react-i18next"
import { type FloorPerson, type FloorSpace } from "@/lib/api"
import { cn } from "@/lib/utils"
import { FLOOR_TONE, floorLabel } from "../_lib/cover-labels"
import { LATE_RING, STATE_RING, lateness, type FloorTally } from "../_lib/floor-view"

/* What both floor cards (exceptions and lanes) draw: the head, the proportion bar, an avatar. */

/**
 * The proportion bar.
 *
 * Reads in a glance; the fraction beside it is the footnote, not the headline.
 * ⚠️ Only people who were DUE are in the track — somebody on approved leave was
 * never going to be here, and padding the bar with them would make a thin floor
 * look comfortable.
 */
export function Bar({ space, t: c }: { space: FloorSpace; t: FloorTally }) {
  const total = c.due || 1
  const pct = (n: number) => `${(n / total) * 100}%`
  const floorPct = space.minCover ? Math.min(100, (space.minCover / total) * 100) : null

  return (
    <div className="relative h-2 w-full overflow-visible rounded-full bg-muted">
      <div className="flex h-full w-full overflow-hidden rounded-full">
        {c.busy > 0 && <span className="h-full bg-blue-500" style={{ width: pct(c.busy) }} />}
        {c.working > 0 && <span className="h-full bg-shell-accent" style={{ width: pct(c.working) }} />}
        {c.break > 0 && <span className="h-full bg-shell-warn" style={{ width: pct(c.break) }} />}
        {c.expected > 0 && (
          <span
            className="h-full bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)]"
            style={{ width: pct(c.expected) }}
          />
        )}
      </div>
      {/* The floor, drawn ON the bar: "are we above the line" needs no arithmetic. */}
      {floorPct !== null && (
        <span
          className="absolute -top-1 -bottom-1 w-0.5 rounded-sm bg-foreground/60"
          style={{ left: `${floorPct}%` }}
          aria-hidden
        />
      )}
    </div>
  )
}

function Fraction({ t: c }: { t: FloorTally }) {
  return (
    <span className="flex items-baseline gap-0.5 tabular-nums">
      <span className="text-[23px] font-bold leading-none tracking-tight">{c.here}</span>
      <span className="text-[13px] font-semibold text-muted-foreground">/{c.due}</span>
    </span>
  )
}

export function Avatar({ person, size = "sm" }: { person: FloorPerson; size?: "sm" | "md" }) {
  const late = lateness(person)
  const ring = late ? LATE_RING[late.tone] : STATE_RING[person.state]
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-muted " +
          "font-semibold text-muted-foreground ring-2 ring-offset-2 " +
          "ring-offset-card",
        size === "md" ? "h-9 w-9 text-[12.5px]" : "h-7 w-7 text-[10.5px]",
        ring,
        person.state === "rest" && "opacity-50",
        (person.state === "leave" || person.state === "expected") && "ring-dashed",
      )}
    >
      {person.firstName[0]}
      {person.lastName[0]}
    </span>
  )
}

export function CardHead({ space, c }: { space: FloorSpace; c: FloorTally }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5">
      <span className="flex min-w-0 items-baseline gap-2.5">
        <b className="truncate text-[14.5px] font-semibold tracking-tight">{space.spaceName}</b>
        {!space.rotaKnown && (
          <span
            className="shrink-0 text-[11px] text-muted-foreground/70"
            title={t(
              "cover.noRota.hint",
              "Nobody here has a working week set, so this counts heads rather than a rota.",
            )}
          >
            {t("cover.noRota.badge", "no rota set")}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2.5">
        <Fraction t={c} />
        <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", FLOOR_TONE[space.status])}>
          {floorLabel(space, t)}
        </span>
      </span>
    </div>
  )
}
