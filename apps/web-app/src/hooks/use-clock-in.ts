"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { TFunction } from "i18next"
import type { TimeEntry } from "@hbcfield/shared"
import { attendanceApi } from "@/lib/api"
import { shortfallMinutes, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN, mayClockInRemotely } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
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
export type ClockAction =
  | "out"
  | { out: true; earlyReason?: string }
  /** No workspace to be away from — the org's Remote bucket. */
  | "remote"
  | { locationId: string }

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
  const [awayPickerOpen, setAwayPickerOpen] = useState(false)
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
    The workspaces this member may work AWAY from, decided by the server with
    the same rule the clock-in refuses by.

    Filtered here rather than fetched separately: it is the same list, asked a
    second question, and a second request would be a second chance for the two
    answers to disagree.
  */
  const awayLocations = locations.filter((l) => l.awayAllowed)

  /*
    Whether to offer "away" at all.

    Somebody may hold the account grant and still have nowhere to use it —
    every workspace they are assigned to requires presence. Showing the button
    there offers a choice that can only end in a refusal, which is worse than
    not offering it: the member cannot tell whether they did something wrong.

    The bucket remains for a member assigned to NO workspace, who has no site to
    be away from and for whom the account grant is the whole answer.
  */
  const hasNoWorkspace = locations.length === 0
  const mayClockInAway = awayLocations.length > 0 || (hasNoWorkspace && canClockInRemotely)

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
    expectedEndAt: activeEntry?.expectedClockOutAt ? new Date(activeEntry.expectedClockOutAt) : null,
    // The tolerance the flags use. Not carried on the entry, so the shared
    // default stands in: a client asking a few minutes early is a nuisance, and
    // the server measures it again with the shift's own value regardless.
    toleranceMin: SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  })

  const clock = useMutation({
    mutationFn: async (action: ClockAction) => {
      const pos = await getBrowserPosition()
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
      toast.success(
        entry.isRemote
          ? t("attendance.my.clockedInAwayToast", "Clocked in — away from the site. This shift will be reviewed.")
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

  /**
   * Clock in away from the site.
   *
   * Mirrors `startOnSite` deliberately: one workspace goes straight through, more
   * than one opens the picker, and none at all falls back to the org's Remote
   * bucket for a member who belongs to no workspace. The button that calls this
   * is only rendered when `mayClockInAway` says there is somewhere to go, so the
   * "nowhere" branch here is a guard rather than a path.
   */
  const startAway = () => {
    if (clock.isPending) return
    if (awayLocations.length > 0) {
      /*
        Show the picker whenever they work in more than one place — even when
        only ONE of those places would take them away from it.

        Not the same rule as on-site, and deliberately. Standing at a site, the
        workspace is obvious from the fact that you are standing there. Working
        from a kitchen table, "which workspace is today for?" is a real question,
        and going straight through would silently charge the day to one of
        several — the exact failure this product already fixed once, when both
        surfaces picked the nearest site and said nothing about it.

        With a single workspace there is nothing to choose, so it goes through.
      */
      if (locations.length > 1) {
        setAwayPickerOpen(true)
      } else {
        clock.mutate({ locationId: awayLocations[0].id })
      }
      return
    }
    if (hasNoWorkspace && canClockInRemotely) {
      clock.mutate("remote")
      return
    }
    toast.error(
      t(
        "attendance.my.noAwayWorkspace",
        "None of your workspaces allow clocking in away from the site.",
      ),
    )
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
    /**
     * Ask to clock in AWAY: straight through when there is one workspace it
     * could be, the picker when there is a choice, and the org's Remote bucket
     * when they belong to no workspace at all.
     */
    startAway,
    /** Is there anywhere this member may actually work away from? */
    mayClockInAway,
    /** The workspaces where they may — the same list, asked a second question. */
    awayLocations,
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
    clockInRemotely: () => clock.mutate("remote"),
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
    /**
     * The SAME picker, in away mode.
     *
     * One component and one flow: the dialog that reads the position and takes a
     * workspace does not care why it is being asked. Two of them would drift the
     * way the two clock-in surfaces did before they shared this hook.
     */
    awayPickerProps: {
      open: awayPickerOpen,
      onOpenChange: setAwayPickerOpen,
      locations: awayLocations,
      pending: clock.isPending,
      onPick: (locationId: string) => clock.mutate({ locationId }),
      geoErrorMessage: (reason: GeolocationFailure) => geoErrorMessage(t, reason),
      away: true,
      /*
        How many of their workspaces were left out, so the dialog can say so.

        A list that silently omits three of a member's five workspaces looks like
        a bug to the person who knows they work at five.
      */
      hiddenCount: locations.length - awayLocations.length,
    },
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
