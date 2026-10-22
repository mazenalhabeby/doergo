"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { TFunction } from "i18next"
import type { TimeEntry } from "@hbcfield/shared"
import { attendanceApi } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { shortfallMinutes, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN, mayClockInRemotely } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { getBrowserPosition, GeolocationError, type GeolocationFailure } from "@/lib/geolocation"
import type { ClockLocation } from "@/components/attendance/clock-in-picker"
import { keys } from "@/lib/query-keys"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"
import { clockOutPosition, isClockOutAction } from "./clock-action"

export type BrowserPosition = Awaited<ReturnType<typeof getBrowserPosition>>

/**
 * Turn a geolocation failure into something a person can act on.
 *
 * Exported because two surfaces show it and it was written twice — the copies
 * had already drifted in wording by the time they were merged.
 */
function geoErrorMessage(t: TFunction, reason: GeolocationFailure): string {
  switch (reason) {
    case "denied":
      return t(
        "attendance.my.geo.denied",
        "Location permission denied. Allow location access in your browser to clock in.",
      )
    case "insecure":
      return t("attendance.my.geo.insecure", "Clock-in requires a secure (HTTPS) connection.")
    case "unsupported":
      return t("attendance.my.geo.unsupported", "Your browser does not support location services.")
    case "timeout":
      return t("attendance.my.geo.timeout", "Timed out getting your location. Please try again.")
    default:
      return t("attendance.my.geo.unavailable", "Could not determine your location. Please try again.")
  }
}

/** What the caller asked for: end the shift, work from anywhere, or a workspace. */
export type ClockAction =
  | "out"
  | { out: true; earlyReason?: string }
  /** No workspace to be away from — the org's Remote bucket. */
  | "remote"
  /** A workspace, with the position already read when choosing it — never asked for twice. */
  | { locationId: string; pos?: BrowserPosition | null; announce?: boolean }

/** useClockIn's state and handlers — everything before its markup, moved here unchanged. */
export function useClockInData({
  enabled = true,
  locationsNow = false,
}: Pick<
  {
    enabled?: boolean
    /**
     * Read the clock-in sites with the page, not after it. For a surface whose
     * screen IS the clock (the shift page). The navbar pill only needs them at the
     * tap, so it lets the page load first; `startClockIn` reads them itself if
     * the tap comes sooner.
     */
    locationsNow?: boolean
  },
  "enabled" | "locationsNow"
>) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [pickerOpen, setPickerOpen] = useState(false)
  // The position read to choose, handed to the picker so it does not ask the browser again.
  const [pickerPosition, setPickerPosition] = useState<BrowserPosition | null>(null)
  const [locating, setLocating] = useState(false)
  const [earlyOpen, setEarlyOpen] = useState(false)

  /*
    The ACCOUNT half of "may they work away from a site".

    Both surfaces used to ask this alone and show the button on its answer — so
    a member granted it whose every workspace requires presence was offered a
    button that could only ever refuse them, with nothing on screen to say why.
    The workspace half is answered per site by the server, below.
  */
  const canClockInRemotely = mayClockInRemotely(user)

  const { data: status } = useQuery({
    queryKey: keys.attendance.myStatus(),
    queryFn: () => attendanceApi.getMyStatus(),
    enabled,
    staleTime: 15_000,
    // A shift can be ended from a phone. Without this the navbar would keep
    // counting a shift that finished twenty minutes ago on another device.
    refetchInterval: 60_000,
  })

  /*
    Where this member may clock in — assignments, not visibility.

    Not `GET /locations`, which answers "what can I see": a manager sees the
    whole directory, so a site could be offered that the clock-in then refuses
    with "You are not assigned to this location".
  */
  const afterFirstLoad = useAfterFirstLoad(2)
  const locationsQuery = {
    queryKey: keys.attendance.myClockInLocations(),
    queryFn: () => attendanceApi.getClockInLocations(),
    staleTime: 5 * 60_000,
  }
  const { data: locationsData } = useQuery({
    ...locationsQuery,
    enabled: enabled && (locationsNow || afterFirstLoad),
  })

  const locations = (locationsData ?? []) as ClockLocation[]

  /*
    ⚠️ No "away" choice any more. Whether a member may clock in away from a
    site is the server's (the workspace's ceiling × their grant), and where they
    are working is decided from evidence afterwards. A member with workspaces
    picks one of them; the Remote bucket is only for somebody who has none
    (`sites.length === 0` in startClockIn).
  */

  const st = (status ?? {}) as Record<string, unknown>
  /*
    The running shift, typed as the shared TimeEntry rather than a local shape.

    A hand-written subset here was enough for the navbar and one field short for
    the shift page, which reads the entry's id to attach its work log — so the
    page would have had to cast the hook's return value straight back to the
    type it already had.
  */
  const activeEntry = (st.currentEntry ?? st.activeEntry ?? st.entry) as TimeEntry | undefined
  const clockedIn =
    Boolean(st.isClockedIn) || st.status === "CLOCKED_IN" || Boolean(activeEntry && !activeEntry.clockOutAt)

  /*
    How far short of the shift a clock-out right now would fall.

    Computed by the SHARED rule, from the expectation the server stamped at
    clock-in — so the figure the member is shown before confirming is the figure
    the server records afterwards. Zero when the shift has no known end, which is
    every task-based and open-hours space: there is nothing to fall short of, so
    nothing is asked.
  */
  const shortfall = shortfallMinutes({
    clockOutAt: new Date(),
    // A daily limit is an allowance, not a shift: leaving before it is not early.
    expectedEndAt:
      activeEntry?.expectedClockOutAt && !activeEntry.endIsDailyLimit ? new Date(activeEntry.expectedClockOutAt) : null,
    // The tolerance the flags use. Not carried on the entry, so the shared
    // default stands in: a client asking a few minutes early is a nuisance, and
    // the server measures it again with the shift's own value regardless.
    toleranceMin: SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  })

  const clock = useMutation({
    mutationFn: async (action: ClockAction) => {
      if (isClockOutAction(action)) {
        // Without a position the shift still ends (the server skips the geofence check).
        const at = await clockOutPosition(getBrowserPosition)
        return attendanceApi.clockOut({
          ...(at ? { lat: at.lat, lng: at.lng, accuracy: at.accuracy } : {}),
          earlyReason: typeof action === "object" && "out" in action ? action.earlyReason : undefined,
        })
      }
      const pos = (typeof action === "object" && "locationId" in action && action.pos) || (await getBrowserPosition())
      if (action === "remote") {
        // No workspace — geofence-exempt; the server captures a coarse place.
        return attendanceApi.clockIn({ isRemote: true, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
      }
      /*
        An explicit workspace, always.

        Both surfaces used to choose the NEAREST site themselves and say nothing
        about it, so a member working across two places was silently clocked in
        at whichever one the GPS preferred — a payroll error that surfaces weeks
        later on a queried timesheet, if at all.
      */
      return attendanceApi.clockIn({
        locationId: action.locationId,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
      })
    },
    onSuccess: (data, action) => {
      setPickerOpen(false)
      qc.invalidateQueries({ queryKey: keys.attendance.myStatus() })
      qc.invalidateQueries({ queryKey: keys.attendance.myHistory() })

      if (isClockOutAction(action)) {
        // The server's own message carries the counted hours and any shortfall,
        // which is more use than "Clocked out" — and it is the figure that will
        // appear on the timesheet, said once, at the moment it is decided.
        const msg = (data as { message?: string } | undefined)?.message
        toast.success(msg || t("attendance.my.clockedOutToast", "Clocked out"))
        return
      }

      /*
        Say when a day is recorded as away.

        The server decides this from the distance to the site, so a member can be
        clocked in AWAY without having asked to be — and the entry is flagged and
        held for review. Finding that out on a timesheet weeks later is finding
        out too late to explain it.
      */
      const entry = (data as { isRemote?: boolean } | undefined) ?? {}
      const name =
        typeof action === "object" && "locationId" in action
          ? locations.find((l) => l.id === action.locationId)?.name
          : undefined
      toast.success(
        entry.isRemote
          ? t("attendance.my.clockedInAwayToast", "Clocked in — away from the site. This shift will be reviewed.")
          : name && typeof action === "object" && "announce" in action && action.announce
            ? t("attendance.my.clockedInAtToast", { name, defaultValue: `Clocked in at ${name}` })
            : t("attendance.my.clockedInToast", "Clocked in"),
      )
    },
    onError: (err: unknown) => {
      if (err instanceof GeolocationError) toast.error(geoErrorMessage(t, err.reason))
      // A coded refusal ("You are 9,631 km from …") in the reader's language; otherwise the server's text.
      else toast.error(serverErrorMessage(err, t, i18n.language))
    },
  })

  return {
    t,
    i18n,
    qc,
    user,
    pickerOpen,
    setPickerOpen,
    pickerPosition,
    setPickerPosition,
    locating,
    setLocating,
    earlyOpen,
    setEarlyOpen,
    canClockInRemotely,
    locationsQuery,
    locationsData,
    locations,
    activeEntry,
    clockedIn,
    shortfall,
    clock,
  }
}
