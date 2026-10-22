"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useClockIn } from "@/hooks"
import { useAuth } from "@/contexts/auth-context"
import { attendanceApi } from "@/lib/api"
import { hasAccessModule, localDateKey } from "@hbcfield/shared/client"
import type { TimeEntry } from "@hbcfield/shared"
import { keys } from "@/lib/query-keys"

/** The member's own shifts page: the clock, the chosen window and the shifts in it. */
export function useMyAttendancePage() {
  const { user } = useAuth()
  const canSee = !user || hasAccessModule(user, "clock")

  /*
    Clocking in and out lives in `useClockIn`, shared with the navbar widget.

    Both surfaces used to carry their own copy — two status queries, two
    locations queries, two sets of geolocation messages and two rules for
    choosing a workspace. The copies drifted, which is how the workspace picker
    came to exist on this page and not in the navbar.

    They share query keys, so mounting the hook twice is still one status
    request and one locations request.
  */
  const { clockedIn, activeEntry, locations, pending, startClockIn, clockOut, pickerProps, earlyProps } = useClockIn({
    enabled: canSee,
    locationsNow: true,
  })

  /*
    Which stretch of time the page is about.

    It used to be "the last 60 entries", which is not a period anybody thinks
    in: a part-timer's 60 entries reach back six months and a full-timer's three
    weeks, so the same screen meant something different to each of them and
    neither could ask "how did last month go".

    The window drives the totals, the bars AND the list, so there is one answer
    on the page rather than three that happen to be near each other.
  */
  const [period, setPeriod] = useState<"7" | "30" | "custom">("7")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  // Days in the reader's own calendar — `toISOString()` is the UTC day, which
  // after midnight in Vienna is still yesterday and left today's shift out.
  const range = (() => {
    if (period === "custom") {
      // Half a range is not a question yet — until both ends are set the page
      // keeps showing the last week rather than an empty screen.
      if (!customFrom || !customTo) return null
      return customFrom <= customTo
        ? { startDate: customFrom, endDate: customTo }
        : { startDate: customTo, endDate: customFrom }
    }
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - (period === "7" ? 6 : 29))
    return { startDate: localDateKey(from), endDate: localDateKey(to) }
  })()

  const effectiveRange =
    range ??
    (() => {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - 6)
      return { startDate: localDateKey(from), endDate: localDateKey(to) }
    })()

  const { data: history, isLoading } = useQuery({
    // The range is IN the key: a different window is a different question, and
    // the answer to the old one must not be shown while this one loads.
    queryKey: keys.attendance.myHistory(effectiveRange.startDate, effectiveRange.endDate),
    queryFn: () => attendanceApi.getMyHistory({ ...effectiveRange, limit: 200 }),
    enabled: canSee,
    // A finished period does not change; only one that includes today does.
    staleTime: 30_000,
  })

  const entries: TimeEntry[] = (history as { data?: TimeEntry[] })?.data ?? []

  return {
    canSee,
    clockedIn,
    activeEntry,
    locations,
    pending,
    startClockIn,
    clockOut,
    pickerProps,
    earlyProps,
    period,
    setPeriod,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    range,
    effectiveRange,
    isLoading,
    entries,
  }
}
