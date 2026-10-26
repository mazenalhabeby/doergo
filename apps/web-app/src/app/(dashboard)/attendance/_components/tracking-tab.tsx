import React from "react"
import { Count } from "@/components/page/page-kit"
import { SEG, segButton } from "@/components/attendance/time-styles"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { AlertCircle, CheckCircle2, Clock, Users, CalendarOff } from "lucide-react"
import { formatHours } from "@hbcfield/shared/client"
import { StatCard } from "../../../../components/attendance/attendance-helpers"
import { OutOfRingPanel } from "./out-of-ring-panel"
import { GeofenceAlerts } from "./geofence-alerts"
import { TrackingFilters } from "./tracking-filters"
import { TrackingResults } from "./tracking-results"
import type { TrackingTabProps } from "./tracking-types"

export type { TrackingTabProps, DayOffRow } from "./tracking-types"

/** The attendance page's Tracking tab: totals, out-of-ring requests, alerts, filters, the entries. */
export function TrackingTab({
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
  isAdmin,
  canReconcile,
  canDelete,
  sort,
  onSort,
}: TrackingTabProps) {
  const { t } = useTranslation()
  // Days off (org-wide) only load in the "all" view. They get their own sub-tab
  // so the Clock In / Clock Out columns aren't shown for rows that never have
  // clock times — the attendance table stays pure clock entries.
  const showDaysOffTab = selectedLocationId === "all"
  const [view, setView] = React.useState<"attendance" | "daysoff">("attendance")
  const effectiveView: "attendance" | "daysoff" = showDaysOffTab ? view : "attendance"

  return (
    <>
      {/* Stats Cards — only show when there's data */}
      {entries.length > 0 && (
        <div data-tour="tracking-stats" className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard title={t("attendance.tracking.currentlyActive")} value={stats.active} icon={Users} color="green" />
          <StatCard
            title={t("attendance.tracking.completedShifts")}
            value={stats.completed}
            icon={CheckCircle2}
            color="blue"
          />
          <StatCard
            title={t("attendance.tracking.autoClockOut")}
            value={stats.autoOut}
            icon={AlertCircle}
            color="amber"
          />
          <StatCard
            title={t("attendance.tracking.totalHours")}
            value={formatHours(stats.totalHours)}
            icon={Clock}
            color="slate"
          />
        </div>
      )}

      {/* Out-of-Ring approver panel (geofence excursions) */}
      {/*
          Approving an out-of-ring request follows the permission, not the
          title. `PATCH /attendance/excursions/:id/approve` and `/reject` are
          both `@RequirePermissionInSpace('canApproveAttendance')` — a sign-off,
          not a correction — so the panel asks exactly that. Gating it on
          isAdmin left the grant unreachable: a permission that exists, is
          granted, and can never be used is decorative.
        */}
      <OutOfRingPanel />

      <GeofenceAlerts violations={geofenceViolations} />

      {/* Filters */}
      <TrackingFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedLocationId={selectedLocationId}
        setSelectedLocationId={setSelectedLocationId}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        endDate={endDate}
        setEndDate={setEndDate}
        setPage={setPage}
        locations={locations}
        refetch={refetch}
      />

      {/* Attendance vs Days-off sub-tabs (days off are org-wide → "all" view only) */}
      {showDaysOffTab && (
        <div className={cn(SEG, "mb-4")}>
          <button
            type="button"
            onClick={() => setView("attendance")}
            className={segButton(effectiveView === "attendance")}
          >
            <Clock className="size-4" />
            {t("attendance.tabs.attendance", "Attendance")}
          </button>
          <button type="button" onClick={() => setView("daysoff")} className={segButton(effectiveView === "daysoff")}>
            <CalendarOff className="size-4" />
            {t("attendance.tabs.daysOff", "Days off")}
            {daysOff.length > 0 && <Count n={daysOff.length} />}
          </button>
        </div>
      )}

      {/* Table */}
      <TrackingResults
        view={effectiveView}
        loadingEntries={loadingEntries}
        loadingLocations={loadingLocations}
        isError={isError}
        error={error}
        refetch={refetch}
        daysOff={daysOff}
        canReconcile={canReconcile}
        isAdmin={isAdmin}
        filteredEntries={filteredEntries}
        selectedLocationId={selectedLocationId}
        sort={sort}
        onSort={onSort}
        canDelete={canDelete}
        meta={meta}
        page={page}
        limit={limit}
        setPage={setPage}
      />
    </>
  )
}
