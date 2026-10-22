"use client"

import { absencesOnly } from "@/lib/requests"
import { keys } from "@/lib/query-keys"
import { useState, useMemo, useEffect } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { format } from "date-fns"
import { useAuth } from "@/contexts/auth-context"
import { attendanceApi, employeesApi, type TimeEntryStatus } from "@/lib/api"
import { useTranslation } from "react-i18next"
import { personName } from "@hbcfield/shared/client"
import { useActiveSpaces } from "@/hooks/use-space-directory"

/** useAttendancePage's state and handlers — everything before its markup, moved here unchanged. */
export function useAttendancePageData() {
  const { user, hasPermission } = useAuth()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Tab state
  const [activeTab, setActiveTab] = useState<"tracking" | "breaks" | "noshows">("tracking")

  // Honor a ?tab= deep-link (e.g. the dashboard's "Pending Actions" reject link
  // → /attendance?tab=approvals). Read after mount to avoid a hydration mismatch.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab")
    // Hours are decided in Approvals now: an old link to this tab goes there.
    if (tab === "approvals") window.location.replace("/approvals?kind=hours")
    else if (tab === "breaks" || tab === "tracking" || tab === "noshows") setActiveTab(tab)
  }, [])

  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  // Date filter is a From–To range (defaults to a single day: today→today).
  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  )
  const [endDate, setEndDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  )
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

  // Reports states
  // reportType and reportLocationId moved to ReportsTab component

  // Check role - only ADMIN and DISPATCHER can access
  const canAccess = user?.role === "ADMIN" || hasPermission('canViewSpaceAttendance') || hasPermission('canViewAllTasks')
  const isAdmin = user?.role === "ADMIN"
  /*
    Correcting somebody else's shift — editing the times, adding a break they
    could not record themselves.

    Separate from `isAdmin`, which on this page still gates worklog editing.
    The server accepts `canReconcileAttendance` for these
    corrections precisely so the person who runs payroll can hold it without
    being handed the organization — and a UI that only offers them to admins
    makes that grant unreachable, which is how a permission quietly becomes
    decorative.
  */
  const canReconcile = isAdmin || hasPermission("canReconcileAttendance")
  /*
    Erasing is its own permission (`canDeleteAttendance`). Signing hours off
    (`canApproveAttendance`) happens in Approvals, not on this page.
  */
  const canDelete = isAdmin || hasPermission("canDeleteAttendance")

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
      sort?.dir ?? null),
    queryFn: () => {
      if (selectedLocationId === "all") {
        // Use getAllEntries for organization-wide view
        return attendanceApi.getAllEntries({
          startDate: rangeStart,
          endDate: rangeEnd,
          status: selectedStatus !== "all" ? selectedStatus as TimeEntryStatus : undefined,
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

  return {
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
  }
}
