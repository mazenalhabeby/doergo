"use client"

import { keys } from "@/lib/query-keys"
import { useState, useMemo } from "react"
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query"
import { format } from "date-fns"
import { notify } from "@/lib/toast"
import { attendanceApi, type TimeEntry, type BreakType } from "@/lib/api"
import { workedMinutes } from "@hbcfield/shared/client"
import { useAttendancePageData } from "./use-attendance-page-data"

/** AttendancePage's state and handlers — everything before its markup, moved here unchanged. */
export function useAttendancePage() {
  const {
    t,
    queryClient,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    selectedLocationId,
    setSelectedLocationId,
    selectedStatus,
    setSelectedStatus,
    selectedDate,
    setSelectedDate,
    endDate,
    setEndDate,
    page,
    setPage,
    sort,
    onSort,
    limit,
    canAccess,
    isAdmin,
    canReconcile,
    canDelete,
    locations,
    loadingLocations,
    attendanceData,
    loadingEntries,
    isError,
    error,
    refetch,
    daysOff,
  } = useAttendancePageData()

  // Weekly/monthly reports moved to ReportsTab component

  // No-shows (shares the tab's query key → deduped) — drives the tab count badge.
  const { data: noShowPeople = [] } = useQuery({
    queryKey: keys.attendance.noShows(),
    queryFn: () => attendanceApi.noShowSummary({ days: 30 }),
    enabled: canAccess,
    staleTime: 30_000,
  })
  const openNoShows = noShowPeople.reduce((n, p) => n + p.open, 0)

  // Breaks state
  const [breakDate, setBreakDate] = useState<string>(format(new Date(), "yyyy-MM-dd"))
  const [breakTypeFilter, setBreakTypeFilter] = useState<string>("all")

  // Fetch active breaks
  const { data: activeBreaks = [], isLoading: loadingActiveBreaks, refetch: refetchActiveBreaks } = useQuery({
    queryKey: keys.attendance.activeBreaks(),
    queryFn: () => attendanceApi.getActiveBreaks(),
    enabled: canAccess && activeTab === "breaks",
    staleTime: 30_000,
    refetchInterval: activeTab === "breaks" ? 30_000 : false, // live: who's on break now
  })

  // Fetch break history
  const { data: breakHistoryData, isLoading: loadingBreakHistory, refetch: refetchBreakHistory } = useQuery({
    queryKey: keys.attendance.breakHistory(breakDate, breakTypeFilter),
    queryFn: () => attendanceApi.getBreakHistory({
      date: breakDate,
      type: breakTypeFilter !== "all" ? breakTypeFilter as BreakType : undefined,
      limit: 50,
    }),
    enabled: canAccess && activeTab === "breaks",
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  // Fetch break summary for the selected date
  const { data: breakSummary, isLoading: loadingBreakSummary } = useQuery({
    queryKey: keys.attendance.breakSummary(breakDate),
    queryFn: () => attendanceApi.getBreakSummary({
      startDate: breakDate,
      endDate: breakDate,
    }),
    enabled: canAccess && activeTab === "breaks",
    staleTime: 30_000,
  })

  // End break mutation
  const endBreakManually = useMutation({
    mutationFn: ({ breakId, notes }: { breakId: string; notes?: string }) =>
      attendanceApi.endBreakManually(breakId, notes),
    onSuccess: () => {
      notify.success(t('attendance.toast.breakEnded'))
      queryClient.invalidateQueries({ queryKey: keys.attendance.activeBreaks() })
      queryClient.invalidateQueries({ queryKey: keys.attendance.breakHistory() })
    },
    onError: (error) => {
      notify.error(error instanceof Error ? error.message : t('attendance.toast.breakEndFailed'))
    },
  })

  // Export CSV moved to ReportsTab component

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
    const countedMinutes = entries.reduce(
      (sum: number, e: TimeEntry) => sum + workedMinutes(e),
      0
    )

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
    return entries.filter((e: TimeEntry) =>
      !e.clockInWithinGeofence || (e.clockOutAt && e.clockOutWithinGeofence === false)
    )
  }, [entries])

  // Client-side search filter
  // Search is now server-side (matches across all pages), so the fetched
  // entries are already filtered — no client-side narrowing needed.
  const filteredEntries = entries

  return {
    t,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    selectedLocationId,
    setSelectedLocationId,
    selectedStatus,
    setSelectedStatus,
    selectedDate,
    setSelectedDate,
    endDate,
    setEndDate,
    page,
    setPage,
    sort,
    onSort,
    limit,
    canAccess,
    isAdmin,
    canReconcile,
    canDelete,
    locations,
    loadingLocations,
    loadingEntries,
    isError,
    error,
    refetch,
    daysOff,
    openNoShows,
    breakDate,
    setBreakDate,
    breakTypeFilter,
    setBreakTypeFilter,
    activeBreaks,
    loadingActiveBreaks,
    refetchActiveBreaks,
    breakHistoryData,
    loadingBreakHistory,
    refetchBreakHistory,
    breakSummary,
    loadingBreakSummary,
    endBreakManually,
    entries,
    meta,
    stats,
    geofenceViolations,
    filteredEntries,
  }
}
