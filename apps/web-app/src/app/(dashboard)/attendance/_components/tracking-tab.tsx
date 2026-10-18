import React from "react"
import { cn } from "@/lib/utils"
import { type TimeEntry } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { AlertCircle, CheckCircle2, Clock, MapPin, Users, CalendarOff } from "lucide-react"
import { StatCard, formatTime, formatDateInZone, StatusBadge } from "./attendance-helpers"
import { personName, countryFromTz } from "@hbcfield/shared/client"
import { OutOfRingPanel } from "./out-of-ring-panel"
import { formatHours } from "@hbcfield/shared/client"
import { useTrackingTab, type TrackingTabProps } from "./use-tracking-tab"
import { TrackingTabTracking } from "./tracking-tab-tracking"
import { TrackingTabTracking2 } from "./tracking-tab-tracking2"

export function TrackingTab({
  stats, entries, geofenceViolations, filteredEntries, loadingEntries, loadingLocations,
  isError, error, refetch, meta,
  selectedLocationId, setSelectedLocationId, selectedStatus, setSelectedStatus,
  selectedDate, setSelectedDate, endDate, setEndDate, searchQuery, setSearchQuery,
  page, setPage, limit, daysOff, locations, isAdmin, canReconcile, canDelete,
  sort, onSort,
}: TrackingTabProps) {
  const vm = useTrackingTab({
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
    onSort
  })
  const {
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
  } = vm

  return (
    <>

        {/* Stats Cards — only show when there's data */}
        {entries.length > 0 && (
          <div data-tour="tracking-stats" className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              title={t("attendance.tracking.currentlyActive")}
              value={stats.active}
              icon={Users}
              color="green"
            />
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

        {/* Geofence Alerts Section */}
        {geofenceViolations.length > 0 && (
          <div className="bg-card rounded-2xl border border-amber-200/60 dark:border-amber-500/25 shadow-sm mb-8 overflow-hidden">
            <div className="p-5 border-b border-amber-100 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
                    {t("attendance.tracking.geofenceAlerts", { count: geofenceViolations.length })}
                  </h2>
                  <p className="text-sm text-amber-700 dark:text-amber-300/80">
                    {t("attendance.tracking.geofenceAlertsDesc")}
                  </p>
                </div>
              </div>
            </div>
            <div className="divide-y divide-amber-100 dark:divide-amber-500/15">
              {geofenceViolations.slice(0, 5).map((entry: TimeEntry) => (
                <div key={entry.id} className="p-4 flex items-center justify-between hover:bg-amber-50/30 dark:hover:bg-amber-500/5">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      firstName={entry.user?.firstName}
                      lastName={entry.user?.lastName}

                      seed={entry.user?.id}
                      size="md"
                    />
                    <div>
                      <p className="font-medium text-foreground">
                        {personName(entry.user)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.location?.name || t("attendance.unknownLocation")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {(() => {
                      const tz = entry.timezone ?? entry.location?.timezone
                      const country = countryFromTz(tz, locale)
                      return (
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground tabular-nums">
                            {formatTime(entry.clockInAt, hour12, locale, tz)}
                            {entry.clockOutAt && ` – ${formatTime(entry.clockOutAt, hour12, locale, tz)}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateInZone(entry.clockInAt, tz, locale)}
                            {country ? ` · ${country}` : ""}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1.5 justify-end">
                            {!entry.clockInWithinGeofence && (
                              <span
                                className={"inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 " +
                                  "text-[11px] font-medium text-amber-600 dark:text-amber-400"}>
                                <MapPin className="size-3" />
                                {t("attendance.tracking.clockInOutside")}
                              </span>
                            )}
                            {entry.clockOutAt && entry.clockOutWithinGeofence === false && (
                              <span
                                className={"inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 " +
                                  "text-[11px] font-medium text-amber-600 dark:text-amber-400"}>
                                <MapPin className="size-3" />
                                {t("attendance.tracking.clockOutOutside")}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                    <StatusBadge status={entry.status} />
                  </div>
                </div>
              ))}
              {geofenceViolations.length > 5 && (
                <div className="p-3 text-center text-sm text-amber-600">
                  {t("attendance.tracking.moreAlerts", { count: geofenceViolations.length - 5 })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <TrackingTabTracking2
          vm={vm}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedLocationId={selectedLocationId}
          setSelectedLocationId={setSelectedLocationId}
          setPage={setPage}
          locations={locations}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
          selectedDate={selectedDate}
          endDate={endDate}
          setSelectedDate={setSelectedDate}
          setEndDate={setEndDate}
          refetch={refetch}
        />

        {/* Attendance vs Days-off sub-tabs (days off are org-wide → "all" view only) */}
        {showDaysOffTab && (
          <div className="mb-4 inline-flex items-center gap-1 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setView("attendance")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-all",
                effectiveView === "attendance" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Clock className="size-4" />
              {t("attendance.tabs.attendance", "Attendance")}
            </button>
            <button
              type="button"
              onClick={() => setView("daysoff")}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-all",
                effectiveView === "daysoff" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarOff className="size-4" />
              {t("attendance.tabs.daysOff", "Days off")}
              {daysOff.length > 0 && (
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    effectiveView === "daysoff" ? "bg-background/20" : "bg-foreground/10")}>
                  {daysOff.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Table */}
        <TrackingTabTracking vm={vm} loadingEntries={loadingEntries} loadingLocations={loadingLocations} isError={isError} error={error} refetch={refetch} daysOff={daysOff} canReconcile={canReconcile} isAdmin={isAdmin} filteredEntries={filteredEntries} selectedLocationId={selectedLocationId} sort={sort} onSort={onSort} canDelete={canDelete} meta={meta} page={page} limit={limit} setPage={setPage} />
    </>
  )
}
