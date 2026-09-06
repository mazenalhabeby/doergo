"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Loader2, MapPin, Navigation } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getBrowserPosition, distanceMeters, GeolocationError, type GeolocationFailure } from "@/lib/geolocation"

export type ClockLocation = {
  id: string
  name: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  geofenceRadius?: number | null
  /**
   * Whether this member may clock in HERE without being on site.
   *
   * Answered by the server with the same rule the clock-in refuses by — the
   * workspace's ceiling and this member's grant — so the list cannot offer a
   * workspace the clock-in then rejects, nor hide one it would accept.
   */
  awayAllowed?: boolean
}

/**
 * Which workspace am I clocking in at?
 *
 * A member assigned to more than one site could not answer that: the page took
 * their position, picked the NEAREST workspace and clocked them in there
 * silently. Two sites a few streets apart — or one fuzzy GPS fix — and the shift
 * landed on the wrong workspace, which nobody notices until a timesheet is
 * queried weeks later.
 *
 * So when there is a real choice, the member makes it. The list is ordered by
 * distance and the nearest in-range site is pre-selected, because that IS
 * usually right; what changes is that it is now visible and can be overridden.
 *
 * A workspace with no coordinates is offered like any other. It is
 * geofence-exempt on the server and clocks in perfectly well — the old code
 * filtered those out client-side as "no GPS", so an organization that had never
 * set coordinates could not clock in from the web at all.
 */
export function ClockInPicker({
  open,
  onOpenChange,
  locations,
  onPick,
  pending,
  geoErrorMessage,
  away,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  locations: ClockLocation[]
  onPick: (locationId: string) => void
  pending: boolean
  geoErrorMessage: (reason: GeolocationFailure) => string
  /**
   * Working AWAY from the site rather than at it.
   *
   * The same dialog either way — one component, one flow, one place where the
   * distance is read and a workspace is chosen. Only the words change, because
   * only the question does: "which one are you at" becomes "which one are you
   * working for". Two dialogs would drift the way the two clock-in surfaces
   * did before they shared a hook.
   */
  away?: boolean
}) {
  const { t } = useTranslation()
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)

  /*
    Read the position when the dialog opens, not on every render of the page.

    Asking for location on page load would put a browser permission prompt in
    front of somebody who came to look at last week's hours, and a member who
    denies it once has denied it for the site.
  */
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLocating(true)
    setGeoError(null)
    getBrowserPosition()
      .then((p) => { if (!cancelled) setPos(p) })
      .catch((e: unknown) => {
        if (cancelled) return
        // Not fatal. Without a fix the distances are unknown, and the member can
        // still say where they are — the server checks the geofence either way,
        // which is the boundary that actually matters.
        setGeoError(e instanceof GeolocationError ? geoErrorMessage(e.reason) : t("common.error", "Something went wrong"))
      })
      .finally(() => { if (!cancelled) setLocating(false) })
    return () => { cancelled = true }
  }, [open, geoErrorMessage, t])

  const ranked = useMemo(() => {
    const withDistance = locations.map((l) => {
      const hasCoords = typeof l.lat === "number" && typeof l.lng === "number"
      const metres = pos && hasCoords ? distanceMeters(pos, { lat: l.lat as number, lng: l.lng as number }) : null
      // The server allows the GPS error margin so a plausible on-site fix is not
      // rejected for a fuzzy reading; the badge has to agree with it, or it says
      // "too far" about a clock-in that then succeeds.
      const inRange =
        metres == null ? null : metres <= (l.geofenceRadius ?? 15) + (pos?.accuracy ?? 0)
      return { ...l, metres, inRange, hasCoords }
    })
    return withDistance.sort((a, b) => {
      if (a.metres == null && b.metres == null) return a.name.localeCompare(b.name)
      if (a.metres == null) return 1
      if (b.metres == null) return -1
      return a.metres - b.metres
    })
  }, [locations, pos])

  // Pre-select the nearest site the member is actually standing in; failing
  // that, the nearest one. Never pre-select nothing — that turns a one-tap
  // action into two for the common case.
  useEffect(() => {
    if (!open) return
    setChosen((prev) => prev ?? (ranked.find((r) => r.inRange) ?? ranked[0])?.id ?? null)
  }, [open, ranked])

  useEffect(() => { if (!open) setChosen(null) }, [open])

  const distanceLabel = (metres: number | null, hasCoords: boolean) => {
    if (!hasCoords) return t("attendance.my.picker.noGeofence", "No geofence")
    if (metres == null) return t("attendance.my.picker.unknownDistance", "Distance unknown")
    return metres < 1000
      ? t("attendance.my.picker.metresAway", "{{n}} m away", { n: Math.round(metres) })
      : t("attendance.my.picker.kmAway", "{{n}} km away", { n: (metres / 1000).toFixed(1) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {away
              ? t("attendance.my.picker.awayTitle", "Which workspace are you working for?")
              : t("attendance.my.picker.title", "Where are you clocking in?")}
          </DialogTitle>
          <DialogDescription>
            {away
              ? t(
                  "attendance.my.picker.awaySubtitle",
                  "You are not at the site. The day is recorded against the workspace you pick — with its shift and its rests — and marked as away for review.",
                )
              : t("attendance.my.picker.subtitle", "You work at more than one place. Pick the one you are at now.")}
          </DialogDescription>
        </DialogHeader>

        {locating && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("attendance.my.locating", "Getting your location…")}
          </p>
        )}
        {geoError && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            {geoError}{" "}
            {t("attendance.my.picker.noFix", "You can still choose where you are — your site will be verified when you clock in.")}
          </p>
        )}

        <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto">
          {ranked.map((l) => {
            const selected = chosen === l.id
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
                    <span className="block truncate text-sm font-medium text-foreground">{l.name}</span>
                    {l.address && <span className="block truncate text-xs text-muted-foreground">{l.address}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {distanceLabel(l.metres, l.hasCoords)}
                      {l.inRange === true && (
                        <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-green-700 dark:text-green-400">
                          {t("attendance.my.picker.inRange", "You are here")}
                        </span>
                      )}
                      {l.inRange === false && (
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
            {pending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{t("attendance.my.locating", "Getting your location…")}</>
            ) : (
              <><Navigation className="h-4 w-4" />{t("attendance.my.clockIn", "Clock In")}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
