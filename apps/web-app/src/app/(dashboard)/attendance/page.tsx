"use client"

import { absencesOnly } from "@/lib/requests"
import { keys } from "@/lib/query-keys"
import dynamic from "next/dynamic"

import { useState, useMemo, useEffect } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { Clock, XCircle, Coffee, UserX } from "lucide-react"
import { format } from "date-fns"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import { attendanceApi, employeesApi, type TimeEntry, type TimeEntryStatus, type BreakType } from "@/lib/api"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useTranslation } from "react-i18next"
import { personName, workedMinutes } from "@hbcfield/shared/client"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import { useAttendancePage } from "./use-attendance-page"
import {
  BreaksTab,
  TrackingTab,
  NoShowsTab,
  AddDayOffDialog,
  AddAttendanceDialog,
} from "./attendance-page-helpers"

export default function AttendancePage() {
  const {
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
  } = useAttendancePage()

  // Not authorized
  if (!canAccess) {
    return (
      <div className="min-h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <XCircle className="size-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground">{t('common.accessDenied')}</h2>
          <p className="text-muted-foreground mt-2">
            {t('common.noPermissionView')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 data-tour="attendance-header" className="text-3xl font-bold text-foreground tracking-tight">
                {t('attendance.management.title')}
              </h1>
              <p className="mt-1.5 text-muted-foreground">
                {t('attendance.management.subtitle')}
              </p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <AddDayOffDialog />
                <AddAttendanceDialog />
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as typeof activeTab)} className="mb-6">
          <TabsList data-tour="attendance-tabs" className="bg-card border border-border/60 rounded-xl p-1 shadow-sm h-auto">
            <TabsTrigger
              value="tracking"
              className={"data-[state=active]:bg-foreground data-[state=active]:text-background " +
                "data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium " +
                "transition-all"}
            >
              <Clock className="size-3.5 mr-1.5" />
              {t('attendance.tabs.tracking')}
            </TabsTrigger>
            <TabsTrigger
              value="breaks"
              data-tour="attendance-tab-breaks"
              onClick={() => setActiveTab("breaks")}
              className={"data-[state=active]:bg-foreground data-[state=active]:text-background " +
                "data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium " +
                "transition-all relative"}
            >
              <Coffee className="size-3.5 mr-1.5" />
              {t('attendance.tabs.breaks')}
              {activeBreaks.length > 0 ? (
                <span
                  className={"ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] " +
                    "text-[10px] font-bold bg-orange-400 text-white rounded-full px-1"}>
                  {activeBreaks.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              value="noshows"
              onClick={() => setActiveTab("noshows")}
              className={"data-[state=active]:bg-foreground data-[state=active]:text-background " +
                "data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium " +
                "transition-all relative"}
            >
              <UserX className="size-3.5 mr-1.5" />
              {t('attendance.tabs.noShows', 'No-shows')}
              {openNoShows > 0 ? (
                <span
                  className={"ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] " +
                    "text-[10px] font-bold bg-red-500 text-white rounded-full px-1"}>
                  {openNoShows}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* Daily Tracking Tab */}
          <TabsContent value="tracking" className="mt-6">
            <TrackingTab
              stats={stats} entries={entries} geofenceViolations={geofenceViolations}
              filteredEntries={filteredEntries} loadingEntries={loadingEntries}
              loadingLocations={loadingLocations} isError={isError} error={error} refetch={refetch}
              meta={meta}
              selectedLocationId={selectedLocationId} setSelectedLocationId={setSelectedLocationId}
              selectedStatus={selectedStatus} setSelectedStatus={setSelectedStatus}
              selectedDate={selectedDate} setSelectedDate={setSelectedDate}
              endDate={endDate} setEndDate={setEndDate}
              searchQuery={searchQuery} setSearchQuery={setSearchQuery}
              page={page} setPage={setPage} limit={limit} daysOff={daysOff} locations={locations}
              isAdmin={isAdmin}
              canReconcile={canReconcile}
              canDelete={canDelete}
              sort={sort} onSort={onSort}
            />
          </TabsContent>

          {/* Breaks Tab */}
          <TabsContent value="breaks" className="mt-6">
            <BreaksTab
              isAdmin={isAdmin}
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
    </div>
  )
}
