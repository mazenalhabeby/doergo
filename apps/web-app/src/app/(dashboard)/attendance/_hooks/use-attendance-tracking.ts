"use client"

import { absencesOnly } from "@/lib/requests"
import { keys } from "@/lib/query-keys"
import { useState, useMemo, useEffect } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { format } from "date-fns"
import { attendanceApi, employeesApi, type TimeEntry, type TimeEntryStatus } from "@/lib/api"
import { personName, workedMinutes } from "@hbcfield/shared/client"
import { useActiveSpaces } from "@/hooks/use-space-directory"

/**
 * The Tracking tab's reads: its filters, sort and page, the entries (org-wide or one workspace),
 * the approved days off in range, and the totals drawn from them.
 */
export function useAttendanceTracking(canAccess: boolean, activeTab: "tracking" | "breaks" | "noshows") {
  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  // Date filter is a From–To range (defaults to a single day: today→today).
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"))
  const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"))
  const [page, setPage] = useState(1)
  // Server-side search across all pages, once the typing settles.
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 350)

  // Server-side sort across ALL pages. Click a column to cycle asc → desc → off;
  // any change resets to page 1 so the sorted set starts from the top.
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null)
  const onSort = (key: string) => {
    setPage(1)
    setSort((cur) => (cur?.key !== key ? { key, dir: "asc" } : cur.dir === "asc" ? { key, dir: "desc" } : null))
  }

  // A new search term starts from page 1.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])
  const limit = 20

  // Normalized date range (guards against an inverted To < From).
  const rangeStart = endDate < selectedDate ? endDate : selectedDate
  const rangeEnd = endDate < selectedDate ? selectedDate : endDate

  // Fetch locations
  const { data: locations = [], isLoading: loadingLocations } = useActiveSpaces({ enabled: canAccess })

  // Fetch attendance entries - use getAllEntries for "all" locations, otherwise use getLocationEntries
  const {
    data: attendanceData,
    isLoading: loadingEntries,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: keys.attendance.list(
      selectedLocationId,
      selectedStatus,
      selectedDate,
      endDate,
      debouncedSearch,
      page,
      limit,
      sort?.key ?? null,
      sort?.dir ?? null,
    ),
    queryFn: () => {
      if (selectedLocationId === "all") {
        // Use getAllEntries for organization-wide view
        return attendanceApi.getAllEntries({
          startDate: rangeStart,
          endDate: rangeEnd,
          status: selectedStatus !== "all" ? (selectedStatus as TimeEntryStatus) : undefined,
          search: debouncedSearch || undefined,
          page,
          limit,
          sortBy: sort?.key,
          sortOrder: sort?.dir,
        })
      }
      return attendanceApi.getLocationEntries(selectedLocationId, {
        startDate: rangeStart,
        endDate: rangeEnd,
        search: debouncedSearch || undefined,
        page,
        limit,
        sortBy: sort?.key,
        sortOrder: sort?.dir,
      })
    },
    enabled: canAccess,
    placeholderData: keepPreviousData, // keep the table visible while paging/filtering
    staleTime: 30_000,
    refetchInterval: activeTab === "tracking" ? 30_000 : false, // live refresh on the Tracking tab
  })

  // Approved time-off, shown as inline "day off" rows in the tracking table.
  const { data: orgTimeOff } = useQuery({
    queryKey: keys.timeOff.orgApproved(),
    queryFn: () => employeesApi.getOrgTimeOff("APPROVED"),
    enabled: canAccess && activeTab === "tracking",
    staleTime: 60_000,
  })

  // Day-off rows for the current view: overlapping the selected range, matching
  // the name search. Only in the org-wide view (time off isn't site-scoped). They
  // render in their own "Days off" sub-tab, so no page gate — the full set for the
  // range is available regardless of the attendance page.
  const daysOff = useMemo(() => {
    if (selectedLocationId !== "all") return []
    const q = debouncedSearch.trim().toLowerCase()
    // Only leave is a day off — an approved remote day or changed day is a day worked.
    return absencesOnly(orgTimeOff ?? [])
      .filter((r) => {
        const rs = r.startDate.slice(0, 10)
        const re = r.endDate.slice(0, 10)
        if (!(rs <= rangeEnd && re >= rangeStart)) return false
        if (q) {
          const name = personName(r.technician).toLowerCase()
          if (!name.includes(q)) return false
        }
        return true
      })
      .map((r) => ({
        id: r.id,
        startDate: r.startDate,
        endDate: r.endDate,
        reason: r.reason,
        technician: r.technician,
      }))
  }, [orgTimeOff, selectedLocationId, page, rangeStart, rangeEnd, debouncedSearch])

  const entries = attendanceData?.data || []
  const meta = attendanceData?.meta

  // Calculate stats
  const stats = useMemo(() => {
    const activeCount = entries.filter((e: TimeEntry) => e.status === "CLOCKED_IN").length
    const completedCount = entries.filter((e: TimeEntry) => e.status === "CLOCKED_OUT").length
    const autoOutCount = entries.filter((e: TimeEntry) => e.status === "AUTO_OUT").length
    /*
      The same hours the rows below show.

      This summed raw `totalMinutes` while every row in the table beneath it
      rendered `workedMinutes()` — so the headline said 12.2 hours and the column
      under it added up to 11.5, on one screen, for the same shifts. Breaks were
      not subtracted and the counted window was ignored entirely.
    */
    const countedMinutes = entries.reduce((sum: number, e: TimeEntry) => sum + workedMinutes(e), 0)

    return {
      active: activeCount,
      completed: completedCount,
      autoOut: autoOutCount,
      // Exact — the card rounds it to the minute when it draws it.
      totalHours: countedMinutes / 60,
    }
  }, [entries])

  // Filter entries with geofence violations
  const geofenceViolations = useMemo(() => {
    return entries.filter(
      (e: TimeEntry) => !e.clockInWithinGeofence || (e.clockOutAt && e.clockOutWithinGeofence === false),
    )
  }, [entries])

  // Client-side search filter
  // Search is now server-side (matches across all pages), so the fetched
  // entries are already filtered — no client-side narrowing needed.
  const filteredEntries = entries

  return {
    stats,
    entries,
    geofenceViolations,
    filteredEntries,
    loadingEntries,
    loadingLocations,
    isError,
    error,
    refetch,
    meta,
    selectedLocationId,
    setSelectedLocationId,
    selectedStatus,
    setSelectedStatus,
    selectedDate,
    setSelectedDate,
    endDate,
    setEndDate,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    limit,
    daysOff,
    locations,
    sort,
    onSort,
  }
}
