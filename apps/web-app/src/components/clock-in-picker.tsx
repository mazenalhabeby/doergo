"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Loader2, MapPin, Navigation } from "lucide-react"
import { rankClockInLocations } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
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

/**
 * Which workspace am I clocking in at — asked only when it is not obvious.
 *
 * `useClockIn` opens this after `chooseClockInLocation` could not decide: more
 * than one workspace, and not standing inside exactly one of them. The order
 * is the shared one (inside an area, a shift today, primary, nearest) and the
 * first is already chosen, so the common case is one more tap.
 *
 * A workspace with no coordinates is offered like any other: it is
 * geofence-exempt on the server and clocks in perfectly well.
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
  const [chosen, setChosen] = useState<string | null>(null)

  const ranked = useMemo(() => rankClockInLocations(locations, position), [locations, position])

  // The best one is chosen for them; never nothing, which would turn one tap into two.
  useEffect(() => {
    if (open) setChosen((prev) => prev ?? ranked[0]?.location.id ?? null)
    else setChosen(null)
  }, [open, ranked])

  const distanceLabel = (metres: number | null, hasCoords: boolean) => {
    if (!hasCoords) return t("attendance.my.picker.noGeofence", "No geofence")
    if (metres == null) return t("attendance.my.picker.unknownDistance", "Distance unknown")
    return metres < 1000
      ? t("attendance.my.picker.metresAway", "{{n}} m away", { n: Math.round(metres) })
      : t("attendance.my.picker.kmAway", "{{n}} km away", { n: (metres / 1000).toFixed(1) })
  }
  const chosenName = ranked.find((r) => r.location.id === chosen)?.location.name

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("attendance.my.picker.title", "Where are you clocking in?")}</DialogTitle>
          <DialogDescription>
            {t("attendance.my.picker.subtitle", "You work at more than one place. The best match is already chosen.")}
          </DialogDescription>
        </DialogHeader>

        {!position && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            {t("attendance.my.picker.noFix", "Your location could not be read. You can still choose — your site is checked when you clock in.")}
          </p>
        )}

        <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto">
          {ranked.map(({ location: l, distanceM, inside }) => {
            const selected = chosen === l.id
            const hasCoords = l.lat != null && l.lng != null
            const tooFar = !inside && !l.awayAllowed && hasCoords && distanceM != null && distanceM > (l.geofenceRadius ?? 0)
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setChosen(l.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                    }`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">{l.name}</span>
                      {l.shiftToday && (
                        <span className="rounded-full border px-1.5 py-0 text-[10px] text-muted-foreground">
                          {t("attendance.my.picker.shiftToday", "Shift today")}
                        </span>
                      )}
                      {l.isPrimary && (
                        <span className="rounded-full border px-1.5 py-0 text-[10px] text-muted-foreground">
                          {t("attendance.my.picker.primary", "Primary")}
                        </span>
                      )}
                    </span>
                    {l.address && <span className="block truncate text-xs text-muted-foreground">{l.address}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {distanceLabel(distanceM, hasCoords)}
                      {inside && (
                        <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-green-700 dark:text-green-400">
                          {t("attendance.my.picker.inRange", "You are here")}
                        </span>
                      )}
                      {tooFar && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                          {t("attendance.my.picker.outOfRange", "Too far to clock in")}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={() => chosen && onPick(chosen)}
            disabled={!chosen || pending}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
            {chosenName
              ? t("attendance.my.picker.clockInAt", { name: chosenName, defaultValue: `Clock in at ${chosenName}` })
              : t("attendance.my.clockIn", "Clock In")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
