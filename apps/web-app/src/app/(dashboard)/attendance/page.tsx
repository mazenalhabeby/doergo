"use client"

import { Clock, XCircle, Coffee, UserX } from "lucide-react"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Count, PageHeader } from "@/components/page/page-kit"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { PILL_TAB, PILL_TABS } from "@/components/attendance/time-styles"
import { useAttendancePage } from "./_hooks/use-attendance-page"
import { useAttendanceTracking } from "./_hooks/use-attendance-tracking"
import { useAttendanceBreaks } from "./_hooks/use-attendance-breaks"
import { BreaksTab, TrackingTab, NoShowsTab, AddDayOffDialog, AddAttendanceDialog } from "./_components/attendance-lazy"

export default function AttendancePage() {
  const { t, activeTab, setActiveTab, canAccess, isAdmin, canReconcile, canDelete, canManageLeave, openNoShows } =
    useAttendancePage()
  const {
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
    locations,
    loadingLocations,
    loadingEntries,
    isError,
    error,
    refetch,
    daysOff,
    entries,
    meta,
    stats,
    geofenceViolations,
    filteredEntries,
  } = useAttendanceTracking(canAccess, activeTab)
  const {
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
  } = useAttendanceBreaks(canAccess, activeTab)

  // Not authorized
  if (!canAccess) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="text-center">
          <XCircle className="size-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground">{t("common.accessDenied")}</h2>
          <p className="text-muted-foreground mt-2">{t("common.noPermissionView")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        tour="attendance-header"
        title={t("attendance.management.title")}
        subtitle={t("attendance.management.subtitle")}
        actions={
          (canManageLeave || canReconcile) && (
            <>
              {canManageLeave && <AddDayOffDialog />}
              {/* Adding a missed day: the server's "correct hours" (C4), not admins only. */}
              {canReconcile && <AddAttendanceDialog />}
            </>
          )
        }
      />

      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as typeof activeTab)} className="mb-6">
        <TabsList data-tour="attendance-tabs" className={PILL_TABS}>
          <TabsTrigger value="tracking" className={PILL_TAB}>
            <Clock className="size-3.5" />
            {t("attendance.tabs.tracking")}
          </TabsTrigger>
          <TabsTrigger
            value="breaks"
            data-tour="attendance-tab-breaks"
            onClick={() => setActiveTab("breaks")}
            className={PILL_TAB}
          >
            <Coffee className="size-3.5" />
            {t("attendance.tabs.breaks")}
            {activeBreaks.length > 0 ? <Count n={activeBreaks.length} tone="warn" /> : null}
          </TabsTrigger>
          <TabsTrigger value="noshows" onClick={() => setActiveTab("noshows")} className={PILL_TAB}>
            <UserX className="size-3.5" />
            {t("attendance.tabs.noShows", "No-shows")}
            {openNoShows > 0 ? <Count n={openNoShows} tone="crit" /> : null}
          </TabsTrigger>
        </TabsList>

        {/* Daily Tracking Tab */}
        <TabsContent value="tracking" className="mt-6">
          <TrackingTab
            stats={stats}
            entries={entries}
            geofenceViolations={geofenceViolations}
            filteredEntries={filteredEntries}
            loadingEntries={loadingEntries}
            loadingLocations={loadingLocations}
            isError={isError}
            error={error}
            refetch={refetch}
            meta={meta}
            selectedLocationId={selectedLocationId}
            setSelectedLocationId={setSelectedLocationId}
            selectedStatus={selectedStatus}
            setSelectedStatus={setSelectedStatus}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            endDate={endDate}
            setEndDate={setEndDate}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            page={page}
            setPage={setPage}
            limit={limit}
            daysOff={daysOff}
            locations={locations}
            isAdmin={isAdmin}
            canReconcile={canReconcile}
            canDelete={canDelete}
            sort={sort}
            onSort={onSort}
          />
        </TabsContent>

        {/* Breaks Tab */}
        <TabsContent value="breaks" className="mt-6">
          <BreaksTab
            canReconcile={canReconcile}
            breakSummary={breakSummary}
            loadingBreakSummary={loadingBreakSummary}
            activeBreaks={activeBreaks}
            loadingActiveBreaks={loadingActiveBreaks}
            refetchActiveBreaks={refetchActiveBreaks}
            breakHistoryData={breakHistoryData}
            loadingBreakHistory={loadingBreakHistory}
            refetchBreakHistory={refetchBreakHistory}
            breakDate={breakDate}
            setBreakDate={setBreakDate}
            breakTypeFilter={breakTypeFilter}
            setBreakTypeFilter={setBreakTypeFilter}
            endBreakManually={endBreakManually}
          />
        </TabsContent>

        {/* No-shows Tab */}
        <TabsContent value="noshows" className="mt-6">
          <NoShowsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
