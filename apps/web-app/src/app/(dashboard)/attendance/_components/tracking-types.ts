import type React from "react"
import type { PaginationMeta, TimeEntry, CompanyLocation } from "@/lib/api"

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
