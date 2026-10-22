"use client"

import { useRouteAccess } from "@/hooks/use-route-access"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { useAuth } from "@/contexts/auth-context"
import { calendarApi, employeesApi, type OrgTimeOffRequest } from "@/lib/api"
import { useSpaceScope } from "@/hooks/use-space-scope"
import { useLatched } from "@/hooks/use-latched"
import { keys } from "@/lib/query-keys"

/**
 * Schedule & Requests — one page, two questions.
 *
 *   who is working RIGHT NOW      → the live floor panel
 *   who wants to be off LATER     → the wallchart, decided in place
 *
 * It replaced two tabs. Reading a table of requests and then switching to a
 * calendar to work out who would be left was slow, and worse than slow: the
 * calendar drew only APPROVED leave, so it could not show the effect of the
 * decision being made on the other tab. The answer now travels with the request.
 */

type Range = "fortnight" | "month"

/** The page's window, workspace and selection, and the three reads it draws: leave, the floor, cover. */
export function useScheduleAndTimeOffPage() {
  const { user, hasPermission } = useAuth()
  const searchParams = useSearchParams()

  const [anchor, setAnchor] = useState(() => new Date())
  const [range, setRange] = useState<Range>("month")
  /*
    One workspace at a time, and never "all".

    A floor has a roster, a minimum and a verdict, and none of those mean
    anything averaged across sites — "All" rendered five stacked cards and a
    five-block chart, which is the density this page exists to remove.

    `useSpaceScope` is the app's answer to "which workspace am I looking at",
    so this asks it the same way every other screen does: `allowAll: false`
    opens on the first one, the choice lives in `?space=` so a filtered view is
    a link, and a stale id in the URL falls back instead of erroring. No module
    filter — see the hook.
  */
  const { spaces: spaceOptions, spaceId, setSpaceId, ready: spacesReady, showTabs } = useSpaceScope({ allowAll: false })
  const space = spaceId ?? ""
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const canManage = user?.role === "ADMIN" || hasPermission("canViewAllTasks")
  const canDecide = user?.role === "ADMIN" || hasPermission("canManageRota")

  /*
    A month by default.

    Leave is planned a month out, so the month is the window somebody opens this
    page holding in their head — a fortnight kept hiding the second half of a
    request that had only just been made.

    ⚠️ Thirty columns do not fit a laptop, so the chart scrolls sideways. That is
    survivable only because the footer's name column is sticky: the "on the
    floor" and "against minimum" labels stay put while the days move under them.
    Break that stickiness and this default becomes unreadable. Two weeks stays
    one click away for anyone who wants everything on screen at once.
  */
  const days = useMemo(() => {
    if (range === "month") {
      return eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) })
    }
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: addDays(start, 13) })
  }, [anchor, range])

  /*
    The workspace's own days from the calendar: its weekend (Fri+Sat in Riyadh, Sat+Sun in
    Vienna) and its holidays. One read per window; the chart falls back to Sat+Sun until it lands.
  */
  const calendarDays = useQuery({
    queryKey: keys.calendar.team(space, format(days[0]!, "yyyy-MM-dd"), format(days[days.length - 1]!, "yyyy-MM-dd")),
    queryFn: () =>
      calendarApi.team({
        spaceId: space,
        from: format(days[0]!, "yyyy-MM-dd"),
        to: format(days[days.length - 1]!, "yyyy-MM-dd"),
      }),
    enabled: !!space,
    staleTime: 5 * 60_000,
  })
  const restDays = useMemo(
    () =>
      calendarDays.data
        ? new Set(calendarDays.data.days.filter((d) => d.kind === "weekend").map((d) => d.day))
        : undefined,
    [calendarDays.data],
  )
  const holidayNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const h of calendarDays.data?.holidays ?? []) {
      for (let d = new Date(`${h.date}T12:00:00`); format(d, "yyyy-MM-dd") <= h.endDate; d = addDays(d, 1))
        m.set(format(d, "yyyy-MM-dd"), h.name)
    }
    return m
  }, [calendarDays.data])

  const window = useMemo(
    () => ({
      start: format(days[0]!, "yyyy-MM-dd"),
      end: format(days[days.length - 1]!, "yyyy-MM-dd"),
    }),
    [days],
  )

  // The leave on screen, plus every request still waiting (decided wherever it falls).
  // The wallchart draws them; pending rows carry their cover verdict, computed server-side.
  // floor-now / cover-range are @RequirePermissionInSpace('canViewSpaceAttendance').
  const readsFloor = useRouteAccess().holds("any:canViewSpaceAttendance")
  // The starting balances page, offered only to who may open it (the route table decides).
  const opensOpening = useRouteAccess().may("/members/leave-opening")
  const leaveQuery = useQuery({
    queryKey: keys.timeOff.orgWindow(window.start, window.end),
    queryFn: () => employeesApi.getOrgTimeOff(undefined, { from: window.start, to: window.end }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: canManage,
  })

  // The roster, grouped by workspace — and today's live state, which the panel
  // above the chart renders. One read serves both, so the chart's rows and the
  // panel's chips can never show a different set of people.
  const floorQuery = useQuery({
    queryKey: keys.attendance.floorNow(),
    queryFn: () => employeesApi.getFloorNow(),
    staleTime: 30_000,
    // floor-now / cover-range are @RequirePermissionInSpace('canViewSpaceAttendance').
    enabled: canManage && readsFloor,
  })

  const coverQuery = useQuery({
    queryKey: keys.timeOff.coverRange(window.start, window.end),
    queryFn: () => employeesApi.getCoverRange(window.start, window.end),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: canManage && readsFloor,
  })

  const requests = leaveQuery.data ?? []
  const allSpaces = useMemo(() => floorQuery.data ?? [], [floorQuery.data])

  /*
    Which one OPENS.

    The hook's default is the first workspace, which is what was asked for — but
    on a real organization most workspaces are customer sites with nobody
    assigned, and landing on one of those is the blank page this feature already
    cost a round trip to explain once. So when the address names no workspace,
    move to the first that actually has a roster. Runs once, only while the URL
    is unset, so it never argues with a choice somebody made.
  */
  const nudged = useRef(false)
  useEffect(() => {
    if (nudged.current || !spacesReady || !allSpaces.length) return
    if (searchParams.get("space")) {
      nudged.current = true
      return
    }
    const withPeople = spaceOptions.find((o) => allSpaces.some((s) => s.spaceId === o.id && s.people.length))
    nudged.current = true
    if (withPeople && withPeople.id !== spaceId) setSpaceId(withPeople.id)
  }, [spacesReady, allSpaces, spaceOptions, spaceId, setSpaceId, searchParams])

  const spaces = useMemo(() => allSpaces.filter((s) => s.spaceId === space), [allSpaces, space])

  const pending = useMemo(() => requests.filter((r) => r.status === "PENDING"), [requests])

  /** The two facts that decide whether this page needs opening at all. */
  const summary = useMemo(() => {
    // Only this workspace's people — the counts head a page about one floor.
    const inScope = (r: OrgTimeOffRequest) => spaces.some((s) => s.people.some((p) => p.id === r.technicianId))
    const mine = pending.filter(inScope)
    return {
      waiting: mine.length,
      risky: mine.filter((r) => r.cover && (r.cover.level === "short" || r.cover.level === "skill")).length,
      skill: mine.filter((r) => r.cover?.level === "skill").length,
      soonest: mine.map((r) => r.startDate).sort()[0] ?? null,
    }
  }, [pending, spaces, space])

  const selected = selectedId ? (requests.find((r) => r.id === selectedId) ?? null) : null
  const drawerMounted = useLatched(!!selected)

  // Whichever read failed first. Any of the three leaves the page unable to say
  // anything true, so all three are worth reporting rather than drawing blank.
  const loadError = (floorQuery.error ?? leaveQuery.error ?? coverQuery.error) as Error | null

  const step = useCallback(
    (dir: 1 | -1) =>
      setAnchor((a) => (range === "month" ? (dir === 1 ? addMonths(a, 1) : subMonths(a, 1)) : addDays(a, dir * 14))),
    [range],
  )

  return {
    anchor,
    setAnchor,
    range,
    setRange,
    spaceOptions,
    spaceId,
    setSpaceId,
    showTabs,
    space,
    selectedId,
    setSelectedId,
    canManage,
    canDecide,
    days,
    restDays,
    holidayNames,
    opensOpening,
    leaveQuery,
    floorQuery,
    coverQuery,
    requests,
    spaces,
    summary,
    selected,
    drawerMounted,
    loadError,
    step,
  }
}
