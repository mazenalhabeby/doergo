"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { TFunction } from "i18next"
import type { TimeEntry } from "@hbcfield/shared"
import { attendanceApi } from "@/lib/api"
import { getBrowserPosition, GeolocationError, type GeolocationFailure } from "@/lib/geolocation"
import type { ClockLocation } from "@/components/clock-in-picker"

/**
 * Turn a geolocation failure into something a person can act on.
 *
 * Exported because two surfaces show it and it was written twice — the copies
 * had already drifted in wording by the time they were merged.
 */
export function geoErrorMessage(t: TFunction, reason: GeolocationFailure): string {
  switch (reason) {
    case "denied":
      return t("attendance.my.geo.denied", "Location permission denied. Allow location access in your browser to clock in.")
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
export type ClockAction = "out" | "remote" | { locationId: string }

/**
 * Clocking in and out — the whole behaviour, in one place.
 *
 * There are TWO clock-in controls on the web: the navbar widget and the button
 * on the shift page. They were written separately and each carried its own copy
 * of the status query, the locations query, the geolocation error messages and
 * the rule for choosing a workspace — about eighty duplicated lines whose only
 * difference was which one had been fixed most recently. The workspace picker
 * went into one of them and not the other, which is precisely the failure this
 * shape produces.
 *
 * So the behaviour lives here and the two components are only presentation: one
 * is a pill in a navbar, the other is a card on a page, and neither knows how a
 * clock-in works. Adding a third surface is now a render, not a re-implementation.
 *
 * React Query does the rest of the de-duplication: both surfaces mount this hook
 * at once, and because they share query keys there is ONE status request and one
 * locations request between them, not two of each.
 */
export function useClockIn({ enabled = true }: { enabled?: boolean } = {}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data: status } = useQuery({
    queryKey: ["my-attendance-status"],
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
  const { data: locationsData } = useQuery({
    queryKey: ["my-clock-in-locations"],
    queryFn: () => attendanceApi.getClockInLocations(),
    enabled,
    staleTime: 5 * 60_000,
  })

  const locations = (locationsData ?? []) as ClockLocation[]

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

  const clock = useMutation({
    mutationFn: async (action: ClockAction) => {
      const pos = await getBrowserPosition()
      if (action === "out") {
        return attendanceApi.clockOut({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
      }
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
      return attendanceApi.clockIn({ locationId: action.locationId, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
    },
    onSuccess: (_data, action) => {
      setPickerOpen(false)
      qc.invalidateQueries({ queryKey: ["my-attendance-status"] })
      qc.invalidateQueries({ queryKey: ["my-attendance-history"] })
      toast.success(
        action === "out"
          ? t("attendance.my.clockedOutToast", "Clocked out")
          : t("attendance.my.clockedInToast", "Clocked in"),
      )
    },
    onError: (err: unknown) => {
      if (err instanceof GeolocationError) toast.error(geoErrorMessage(t, err.reason))
      else toast.error(err instanceof Error ? err.message : t("common.error", "Something went wrong"))
    },
  })

  /**
   * Start an on-site clock-in.
   *
   * One workspace is not a choice — asking somebody with a single site to
   * confirm it every morning is a tap they can never get wrong, which is the
   * definition of a dialog that should not exist. The picker opens only when
   * there is something to decide.
   */
  const startOnSite = () => {
    /*
      Nowhere to clock in is a real state — a member nobody has put on a site
      yet. The shift page says so in place of its button, but the navbar has no
      room for that, and opening an empty picker asks somebody to choose from
      nothing. Say what is wrong instead.
    */
    if (locations.length === 0) {
      toast.error(
        t(
          "attendance.my.noAssignedLocations",
          "You are not assigned to a workspace yet, so there is nowhere to clock in. Ask your admin to add you to one.",
        ),
      )
      return
    }
    if (locations.length === 1) {
      clock.mutate({ locationId: locations[0].id })
      return
    }
    setPickerOpen(true)
  }

  return {
    /** Is a shift running, and which one. */
    clockedIn,
    activeEntry,
    /** Workspaces this member may clock in at right now. */
    locations,
    /** True while a clock-in or clock-out is in flight, on EITHER surface. */
    pending: clock.isPending,
    /** What is in flight — so a surface can spin the right button only. */
    action: clock.variables as ClockAction | undefined,
    /** Ask to clock in on site: straight through, or open the picker. */
    startOnSite,
    /** Clock in remotely, or clock out. */
    clockOut: () => clock.mutate("out"),
    clockInRemotely: () => clock.mutate("remote"),
    /** Spread straight into <ClockInPicker {...pickerProps} />. */
    pickerProps: {
      open: pickerOpen,
      onOpenChange: setPickerOpen,
      locations,
      pending: clock.isPending,
      onPick: (locationId: string) => clock.mutate({ locationId }),
      geoErrorMessage: (reason: GeolocationFailure) => geoErrorMessage(t, reason),
    },
  }
}
