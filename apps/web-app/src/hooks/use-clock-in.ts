"use client"

import { toast } from "sonner"
import { serverErrorMessage } from "@/lib/server-error"
import { chooseClockInLocation, parseClockInPick } from "@hbcfield/shared/client"
import { getBrowserPosition } from "@/lib/geolocation"
import type { ClockLocation } from "@/components/attendance/clock-in-picker"
import { useClockInData, type BrowserPosition, type ClockAction } from "./use-clock-in-data"

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
export function useClockIn({
  enabled = true,
  locationsNow = false,
}: {
  enabled?: boolean
  /**
   * Read the clock-in sites with the page, not after it. For a surface whose
   * screen IS the clock (the shift page). The navbar pill only needs them at the
   * tap, so it lets the page load first; `startClockIn` reads them itself if
   * the tap comes sooner.
   */
  locationsNow?: boolean
} = {}) {
  const {
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
  } = useClockInData({ enabled, locationsNow })

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
    /*
      The sites are read after the page has loaded; a tap that comes first must
      not be judged on an empty list — that would say "not assigned anywhere",
      or clock somebody in away from a site they are assigned to.
    */
    let sites = locations
    if (!locationsData) {
      try {
        sites = ((await qc.fetchQuery(locationsQuery)) ?? []) as ClockLocation[]
      } catch (e) {
        toast.error(serverErrorMessage(e, t, i18n.language))
        return
      }
    }
    if (sites.length === 0) {
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
    if (sites.length === 1) {
      clock.mutate({ locationId: sites[0].id })
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
    // The member's own choice: clock in where they stand, or always choose (Settings › Clock in).
    const choice = chooseClockInLocation(sites, pos, parseClockInPick(user?.clockInPick))
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
