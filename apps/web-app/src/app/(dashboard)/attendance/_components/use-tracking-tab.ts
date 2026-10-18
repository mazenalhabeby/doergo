import React from "react"
import type { PaginationMeta } from "@/lib/api"
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns"
import { type TimeEntry, type CompanyLocation } from "@/lib/api"
import { useTranslation } from "react-i18next"
import { useOvertimeAction } from "@/hooks/use-overtime-action"
import { useTimeFormat } from "@/hooks"

// Approved time-off shown inline as a "day off" row in the tracking table.
export type DayOffRow = {
  id: string
  startDate: string
  endDate: string
  reason?: string | null
  technician?: { id: string; firstName: string; lastName: string } | null
}

export interface TrackingTabProps {
  stats: { active: number; completed: number; autoOut: number; totalHours: number }
  entries: TimeEntry[]
  geofenceViolations: TimeEntry[]
  filteredEntries: TimeEntry[]
  loadingEntries: boolean
  loadingLocations: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  meta?: PaginationMeta
  selectedLocationId: string
  setSelectedLocationId: (v: string) => void
  selectedStatus: string
  setSelectedStatus: (v: string) => void
  selectedDate: string
  setSelectedDate: (v: string) => void
  endDate: string
  setEndDate: (v: string) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  page: number
  setPage: React.Dispatch<React.SetStateAction<number>>
  limit: number
  daysOff: DayOffRow[]
  locations: CompanyLocation[]
  isAdmin: boolean
  /** May correct someone else's shift — edit times, add a break they could not
   *  record themselves. `canReconcileAttendance`, not "is an admin". */
  canReconcile: boolean
  /** May erase an entry. `canDeleteAttendance` — correcting never implies it. */
  canDelete: boolean
  sort: { key: string; dir: "asc" | "desc" } | null
  onSort: (key: string) => void
}

/** TrackingTab's state and handlers — everything before its markup, moved here unchanged. */
export function useTrackingTab({
  stats, entries, geofenceViolations, filteredEntries, loadingEntries, loadingLocations,
  isError, error, refetch, meta,
  selectedLocationId, setSelectedLocationId, selectedStatus, setSelectedStatus,
  selectedDate, setSelectedDate, endDate, setEndDate, searchQuery, setSearchQuery,
  page, setPage, limit, daysOff, locations, isAdmin, canReconcile, canDelete,
  sort, onSort,
}: Pick<TrackingTabProps,
  | 'stats'
  | 'entries'
  | 'geofenceViolations'
  | 'filteredEntries'
  | 'loadingEntries'
  | 'loadingLocations'
  | 'isError'
  | 'error'
  | 'refetch'
  | 'meta'
  | 'selectedLocationId'
  | 'setSelectedLocationId'
  | 'selectedStatus'
  | 'setSelectedStatus'
  | 'selectedDate'
  | 'setSelectedDate'
  | 'endDate'
  | 'setEndDate'
  | 'searchQuery'
  | 'setSearchQuery'
  | 'page'
  | 'setPage'
  | 'limit'
  | 'daysOff'
  | 'locations'
  | 'isAdmin'
  | 'canReconcile'
  | 'canDelete'
  | 'sort'
  | 'onSort'
>) {
  const { t } = useTranslation()
  const { hour12, locale } = useTimeFormat()
  // Overtime on a closed shift: the approval permission and the Option its route
  // is sold under — one gate, shared with the member's attendance tab.
  const overtime = useOvertimeAction()
  // The entry dialog opens for whoever may correct OR delete; it shows each
  // half only to the permission its route asks.
  const canOpenEntry = canReconcile || canDelete
  const showActions = canOpenEntry || overtime.enabled

  // Days off (org-wide) only load in the "all" view. They get their own sub-tab
  // so the Clock In / Clock Out columns aren't shown for rows that never have
  // clock times — the attendance table stays pure clock entries.
  const showDaysOffTab = selectedLocationId === "all"
  const [view, setView] = React.useState<"attendance" | "daysoff">("attendance")
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const effectiveView: "attendance" | "daysoff" = showDaysOffTab ? view : "attendance"

  // Quick date-range presets (computed once on mount).
  const presets = React.useMemo(() => {
    const now = new Date()
    const f = (d: Date) => format(d, "yyyy-MM-dd")
    return [
      { key: "today", from: f(now), to: f(now) },
      { key: "last7", from: f(subDays(now, 6)), to: f(now) },
      { key: "thisWeek", from: f(startOfWeek(now, { weekStartsOn: 1 })), to: f(endOfWeek(now, { weekStartsOn: 1 })) },
      { key: "thisMonth", from: f(startOfMonth(now)), to: f(endOfMonth(now)) },
      // The whole previous calendar month — the range payroll is checked against.
      { key: "lastMonth", from: f(startOfMonth(subMonths(now, 1))), to: f(endOfMonth(subMonths(now, 1))) },
    ]
  }, [])

  const applyRange = (from: string, to: string) => {
    setSelectedDate(from)
    setEndDate(to)
    setPage(1)
  }

  return {
    t,
    hour12,
    locale,
    overtime,
    canOpenEntry,
    showActions,
    showDaysOffTab,
    setView,
    expandedId,
    setExpandedId,
    effectiveView,
    presets,
    applyRange,
  }
}

/** What TrackingTab and its sections read. */
export type TrackingTabState = ReturnType<typeof useTrackingTab>
