import React from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, Clock, RefreshCw } from "lucide-react";
import type { TrackingTabState } from "./use-tracking-tab"
import type { TrackingTab } from "./tracking-tab"
import { TrackingEntriesTable } from "./tracking-entries-table"
import { TrackingDaysOff } from "./tracking-days-off"

/** Part of TrackingTab's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TrackingTabTracking(
  {
    vm,
    loadingEntries,
    loadingLocations,
    isError,
    error,
    refetch,
    daysOff,
    canReconcile,
    isAdmin,
    filteredEntries,
    selectedLocationId,
    sort,
    onSort,
    canDelete,
    meta,
    page,
    limit,
    setPage
  }: {
    vm: TrackingTabState;
    loadingEntries: Parameters<typeof TrackingTab>[0]['loadingEntries'];
    loadingLocations: Parameters<typeof TrackingTab>[0]['loadingLocations'];
    isError: Parameters<typeof TrackingTab>[0]['isError'];
    error: Parameters<typeof TrackingTab>[0]['error'];
    refetch: Parameters<typeof TrackingTab>[0]['refetch'];
    daysOff: Parameters<typeof TrackingTab>[0]['daysOff'];
    canReconcile: Parameters<typeof TrackingTab>[0]['canReconcile'];
    isAdmin: Parameters<typeof TrackingTab>[0]['isAdmin'];
    filteredEntries: Parameters<typeof TrackingTab>[0]['filteredEntries'];
    selectedLocationId: Parameters<typeof TrackingTab>[0]['selectedLocationId'];
    sort: Parameters<typeof TrackingTab>[0]['sort'];
    onSort: Parameters<typeof TrackingTab>[0]['onSort'];
    canDelete: Parameters<typeof TrackingTab>[0]['canDelete'];
    meta: Parameters<typeof TrackingTab>[0]['meta'];
    page: Parameters<typeof TrackingTab>[0]['page'];
    limit: Parameters<typeof TrackingTab>[0]['limit'];
    setPage: Parameters<typeof TrackingTab>[0]['setPage']
  }) {
  const {
    t,
    effectiveView,
  } = vm
  return (
    <div data-tour="tracking-table" className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">
      {loadingEntries || loadingLocations ? (
        <div className="p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="p-12 text-center">
          <AlertCircle className="size-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">
            {t("attendance.tracking.failedToLoad")}
          </h3>
          <p className="text-muted-foreground mt-1">
            {error instanceof Error ? error.message : t("attendance.tracking.errorOccurred")}
          </p>
          <Button
            variant="outline"
            onClick={() => refetch()}
            className="mt-4"
          >
            <RefreshCw className="size-4 mr-2" />
            {t("common.retry")}
          </Button>
        </div>
      ) : effectiveView === "daysoff" ? (
        <TrackingDaysOff vm={vm} daysOff={daysOff} canReconcile={canReconcile} isAdmin={isAdmin} />
      ) : filteredEntries.length === 0 ? (
        <div className="p-12 text-center">
          <Clock className="size-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">
            {t("attendance.tracking.noRecords")}
          </h3>
          <p className="text-muted-foreground mt-1">
            {selectedLocationId === "all"
              ? t("attendance.tracking.selectLocationHint")
              : t("attendance.tracking.noEntriesHint")}
          </p>
        </div>
      ) : (
        <TrackingEntriesTable
          vm={vm}
          canReconcile={canReconcile}
          isAdmin={isAdmin}
          filteredEntries={filteredEntries}
          sort={sort}
          onSort={onSort}
          canDelete={canDelete}
          meta={meta}
          page={page}
          limit={limit}
          setPage={setPage}
        />
      )}
    </div>
  )
}
