"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { TFunction } from "i18next"
import type { TimeEntry } from "@hbcfield/shared"
import { attendanceApi } from "@/lib/api"
import { shortfallMinutes, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN, mayClockInRemotely, chooseClockInLocation } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { getBrowserPosition, GeolocationError, type GeolocationFailure } from "@/lib/geolocation"

type BrowserPosition = Awaited<ReturnType<typeof getBrowserPosition>>
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
export type ClockAction =
  | "out"
  | { out: true; earlyReason?: string }
  /** No workspace to be away from — the org's Remote bucket. */
  | "remote"
  /** A workspace, with the position already read when choosing it — never asked for twice. */
  | { locationId: string; pos?: BrowserPosition | null; announce?: boolean }

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

  /*
    ⚠️ No "away" choice any more. Whether a member may clock in away from a
    site is the server's (the workspace's ceiling × their grant), and where they
    are working is decided from evidence afterwards. A member with workspaces
    picks one of them; the Remote bucket is only for somebody who has none.
  */
  const hasNoWorkspace = locations.length === 0

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
    expectedEndAt: activeEntry?.expectedClockOutAt && !activeEntry.endIsDailyLimit ? new Date(activeEntry.expectedClockOutAt) : null,
    // The tolerance the flags use. Not carried on the entry, so the shared
    // default stands in: a client asking a few minutes early is a nuisance, and
    // the server measures it again with the shift's own value regardless.
    toleranceMin: SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  })

  const clock = useMutation({
    mutationFn: async (action: ClockAction) => {
      const pos = (typeof action === "object" && "locationId" in action && action.pos) || (await getBrowserPosition())
      if (action === "out" || (typeof action === "object" && "out" in action)) {
        return attendanceApi.clockOut({
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
          earlyReason: typeof action === "object" && "out" in action ? action.earlyReason : undefined,
        })
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
    onSuccess: (data, action) => {
      setPickerOpen(false)
      qc.invalidateQueries({ queryKey: ["my-attendance-status"] })
      qc.invalidateQueries({ queryKey: ["my-attendance-history"] })

      if (action === "out") {
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
      const name = typeof action === "object" && "locationId" in action ? locations.find((l) => l.id === action.locationId)?.name : undefined
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
      else toast.error(err instanceof Error ? err.message : t("common.error", "Something went wrong"))
    },
  })

  /**
   * One button: clock in.
   *
   * Nobody is asked when the answer is obvious — one workspace, or standing
   * inside exactly one of several areas — and otherwise the picker opens with
   * the best one already chosen. The choice itself is `chooseClockInLocation`,
   * shared with the phone, so both order and pick the same way.
   */
  const startClockIn = async () => {
    if (clock.isPending || locating) return
    if (hasNoWorkspace) {
      // Nowhere to be: the org's Remote bucket for somebody granted it; otherwise say what is wrong.
      if (canClockInRemotely) {
        clock.mutate("remote")
        return
      }
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
    setLocating(true)
    let pos: BrowserPosition | null = null
    try {
      pos = await getBrowserPosition()
    } catch {
      // Not fatal: without a position the list is still ordered by shift and primary.
    } finally {
      setLocating(false)
    }
    const choice = chooseClockInLocation(locations, pos)
    if (choice.kind === "auto") {
      clock.mutate({ locationId: choice.location.id, pos, announce: true })
      return
    }
    setPickerPosition(pos)
    setPickerOpen(true)
  }

  return {
    /** Is a shift running, and which one. */
    clockedIn,
    activeEntry,
    /** Workspaces this member may clock in at right now. */
    locations,
    /** True while a clock-in or clock-out is in flight — or the position is being read — on EITHER surface. */
    pending: clock.isPending || locating,
    /** What is in flight — so a surface can spin the right button only. */
    action: clock.variables as ClockAction | undefined,
    /** Clock in: straight through when the workspace is obvious, the picker when it is not. */
    startClockIn,
    /**
     * End the shift.
     *
     * Short of the shift end, this ASKS first rather than clocking out — the
     * member is told how far short they are and gives a reason, which reaches
     * whoever is responsible. It never refuses: a person may always stop working,
     * and confirming is a courtesy, not a gate. The server measures the shortfall
     * again either way.
     */
    clockOut: () => {
      if (shortfall > 0) setEarlyOpen(true)
      else clock.mutate("out")
    },
    /** Minutes short of the shift end, right now; 0 when there is no shift. */
    shortfallMinutes: shortfall,
    /** Spread straight into <ClockOutEarlyDialog {...earlyProps} />. */
    earlyProps: {
      open: earlyOpen,
      onOpenChange: setEarlyOpen,
      shortfallMinutes: shortfall,
      expectedClockOutAt: activeEntry?.expectedClockOutAt ?? null,
      timezone: activeEntry?.timezone ?? activeEntry?.location?.timezone ?? null,
      pending: clock.isPending,
      onConfirm: (earlyReason: string) => {
        setEarlyOpen(false)
        clock.mutate({ out: true, earlyReason })
      },
    },
    /** Spread straight into <ClockInPicker {...pickerProps} />. */
    pickerProps: {
      open: pickerOpen,
      onOpenChange: setPickerOpen,
      locations,
      position: pickerPosition,
      pending: clock.isPending,
      onPick: (locationId: string) => clock.mutate({ locationId, pos: pickerPosition }),
    },
  }
}
