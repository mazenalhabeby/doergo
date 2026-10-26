"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useFormatDistance } from "@/hooks/use-format-distance"
import { Loader2 } from "lucide-react"
import { rankClockInLocations } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export type ClockLocation = {
  id: string
  name: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  geofenceRadius?: number | null
  geofencePolygon?: unknown
  /**
   * Whether this member may clock in HERE without being on site — the server's
   * own answer, so the list never calls a workspace "too far" that would accept them.
   */
  awayAllowed?: boolean
  /** A shift for this member here today, as the server read it. */
  shiftToday?: boolean
  /** This member's primary workspace. */
  isPrimary?: boolean
}

type Ranked = ReturnType<typeof rankClockInLocations<ClockLocation>>[number]
type Status = "here" | "far" | "away" | "none"

/** One verdict per row: on site, too far (refused by the server), allowed from away, or nothing to say. */
function statusOf({ location: l, distanceM, inside }: Ranked): Status {
  if (inside) return "here"
  const known = l.lat != null && l.lng != null && distanceM != null
  if (!known) return "none"
  if (l.awayAllowed) return "away"
  return distanceM > (l.geofenceRadius ?? 0) ? "far" : "none"
}

const PANEL =
  "max-w-[440px] gap-3.5 rounded-[24px] border-shell-line bg-shell-card p-5 font-shell text-shell-ink " +
  "shadow-shell-pop sm:rounded-[24px]"
const ACTION = "flex h-[46px] flex-1 items-center justify-center gap-2 rounded-[14px] px-3 text-sm font-semibold"
const WARN = "bg-[color-mix(in_srgb,var(--shell-warn)_12%,transparent)] text-shell-warn"
const CHECK =
  "absolute -right-1.5 -top-1.5 grid size-[22px] place-items-center rounded-full bg-shell-card text-shell-accent"
const TAG = "rounded-full bg-shell-chip px-[7px] py-0.5 text-[10.5px] font-semibold text-shell-soft"
const STATUS_INK: Record<Status, string> = {
  here: "text-shell-accent",
  far: "text-shell-warn",
  away: "text-shell-soft",
  none: "text-shell-soft",
}

/**
 * Which workspace am I clocking in at — asked only when it is not obvious (clock-picker board, 2026-10-26).
 *
 * `useClockIn` opens this after `chooseClockInLocation` could not decide: more than one workspace, and not
 * standing inside exactly one of them. The order is the shared one (inside an area, a shift today, primary,
 * nearest).
 *
 * ⚠️ The first row the member CAN clock in at is chosen — never one that is too far. Choosing the nearest
 * regardless put "Clock in at Service Center" under a row saying "Too far to clock in", and the server refused.
 * A too-far row stays choosable (to see why) but the button explains instead of sending.
 *
 * A workspace with no coordinates is offered like any other: it is geofence-exempt on the server and clocks in
 * perfectly well. With no position every row is choosable and the server checks the site.
 */
export function ClockInPicker({
  open,
  onOpenChange,
  locations,
  position,
  onPick,
  pending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  locations: ClockLocation[]
  /** The position read when choosing — the picker never asks the browser again. Null when it could not be read. */
  position: { lat: number; lng: number; accuracy?: number } | null
  onPick: (locationId: string) => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const formatDistance = useFormatDistance()
  const [chosen, setChosen] = useState<string | null>(null)
  const ranked = useMemo(() => rankClockInLocations(locations, position), [locations, position])

  // The best one they can USE is chosen for them; never nothing, which would turn one tap into two.
  useEffect(() => {
    if (!open) return setChosen(null)
    const best = ranked.find((r) => statusOf(r) !== "far") ?? ranked[0]
    setChosen((prev) => prev ?? best?.location.id ?? null)
  }, [open, ranked])

  const current = ranked.find((r) => r.location.id === chosen)
  const tooFar = current ? statusOf(current) === "far" : false
  const name = current?.location.name ?? ""

  const statusText = (s: Status, r: Ranked) =>
    s === "here"
      ? t("attendance.my.picker.inRange", "You are here")
      : s === "far"
        ? t("attendance.my.picker.tooFar", "Too far")
        : s === "away"
          ? t("attendance.my.picker.awayAllowed", "Away allowed")
          : r.location.lat == null
            ? t("attendance.my.picker.noGeofence", "No geofence")
            : t("attendance.my.picker.unknownDistance", "Distance unknown")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={PANEL}
        // Focus lands on the dialog, not on the first row: a ring there read as "this one is chosen".
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex-row items-start gap-3 space-y-0 pr-6 text-left">
          <span className="clock-aurora clock-aurora-still grid size-11 shrink-0 place-items-center rounded-[14px]">
            <Icon name="clockIn" size={24} />
          </span>
          <span className="min-w-0">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {t("attendance.my.picker.title", "Where are you clocking in?")}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[13.5px] text-shell-soft">
              {t("attendance.my.picker.subtitle", "You work at more than one place. The best match is already chosen.")}
            </DialogDescription>
          </span>
        </DialogHeader>

        <p
          className={cn(
            "flex items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px]",
            position
              ? "bg-shell-chip text-shell-soft"
              : "bg-[color-mix(in_srgb,var(--shell-warn)_12%,transparent)] text-shell-warn",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              position ? "bg-shell-live shadow-[0_0_0_4px_var(--shell-accent-soft)]" : "bg-shell-warn",
            )}
          />
          {!position
            ? t(
                "attendance.my.picker.noFix",
                "Your location could not be read. You can still choose — your site is checked when you clock in.",
              )
            : position.accuracy
              ? t("attendance.my.picker.yourLocationAccuracy", {
                  distance: formatDistance(position.accuracy),
                  defaultValue: "Your location · accurate to {{distance}}",
                })
              : t("attendance.my.picker.yourLocation", "Your location")}
        </p>

        <div
          role="radiogroup"
          aria-label={t("nav.spaces", "Workspaces")}
          className="-mx-1 max-h-[46vh] space-y-2 overflow-y-auto px-1 pt-2"
        >
          {ranked.map((r) => {
            const { location: l, distanceM } = r
            const selected = chosen === l.id
            const status = statusOf(r)
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChosen(l.id)}
                className={cn(
                  "relative flex w-full items-center gap-3 rounded-[18px] border-[1.5px] p-3 text-left outline-none",
                  "transition-[border-color,background-color,transform] duration-200 active:scale-[.99]",
                  "focus-visible:ring-2 focus-visible:ring-shell-accent",
                  selected ? "border-shell-accent bg-shell-nav-on" : "border-shell-line hover:bg-shell-hover",
                )}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-[13px]",
                    status === "far" ? "bg-shell-chip text-shell-soft" : "bg-shell-accent-soft text-shell-accent",
                  )}
                >
                  <Icon name="workspaces" size={22} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-semibold">
                    <span className="truncate">{l.name}</span>
                    {l.shiftToday && (
                      <span className={cn(TAG, "bg-shell-accent-soft text-shell-accent")}>
                        {t("attendance.my.picker.shiftToday", "Shift today")}
                      </span>
                    )}
                    {l.isPrimary && <span className={TAG}>{t("attendance.my.picker.primary", "Primary")}</span>}
                  </span>
                  {l.address && <span className="truncate text-[12.5px] text-shell-soft">{l.address}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-shell-mono text-[15px] font-semibold tracking-tight">
                    {distanceM != null && l.lat != null ? formatDistance(distanceM) : "—"}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold",
                      STATUS_INK[status],
                    )}
                  >
                    {status === "here" && (
                      <i
                        aria-hidden
                        className="size-[7px] rounded-full bg-shell-live shadow-[0_0_0_3px_var(--shell-accent-soft)]"
                      />
                    )}
                    {statusText(status, r)}
                  </span>
                </span>
                {selected && (
                  <span aria-hidden className={CHECK}>
                    <Icon name="selected" size={22} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="h-[46px] rounded-[14px] border border-shell-line px-4 text-sm font-semibold hover:bg-shell-hover disabled:opacity-60"
          >
            {t("common.cancel", "Cancel")}
          </button>
          {tooFar ? (
            <button type="button" disabled className={cn(ACTION, WARN, "cursor-not-allowed")}>
              {t("attendance.my.picker.tooFarAt", { name, defaultValue: "Too far to clock in at {{name}}" })}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => chosen && onPick(chosen)}
              disabled={!chosen || pending}
              className={cn(ACTION, "clock-aurora icon-motion disabled:opacity-60")}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon name="clockIn" size={20} />}
              {name
                ? t("attendance.my.picker.clockInAt", { name, defaultValue: "Clock in at {{name}}" })
                : t("attendance.my.clockIn", "Clock In")}
            </button>
          )}
        </div>
        {tooFar && current?.distanceM != null && (
          <p className="text-center text-[12.5px] text-shell-soft">
            {t("attendance.my.picker.tooFarWhy", {
              distance: formatDistance(current.distanceM),
              defaultValue:
                "You're {{distance}} away. Go to the site, or ask your leader to allow clocking in from away.",
            })}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
