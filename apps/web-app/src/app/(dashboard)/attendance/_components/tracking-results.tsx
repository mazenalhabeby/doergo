import React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, Clock, RefreshCw } from "lucide-react"
import type { TrackingTabProps } from "./tracking-types"
import { TrackingEntriesTable } from "./tracking-entries-table"
import { TrackingDaysOff } from "./tracking-days-off"

/** The table card: loading, the error, the days off, nothing found — or the entries. */
export function TrackingResults({
  view,
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
  setPage,
}: Pick<
  TrackingTabProps,
  | "loadingEntries"
  | "loadingLocations"
  | "isError"
  | "error"
  | "refetch"
  | "daysOff"
  | "canReconcile"
  | "isAdmin"
  | "filteredEntries"
  | "selectedLocationId"
  | "sort"
  | "onSort"
  | "canDelete"
  | "meta"
  | "page"
  | "limit"
  | "setPage"
> & { view: "attendance" | "daysoff" }) {
  const { t } = useTranslation()
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
          <h3 className="text-lg font-medium text-foreground">{t("attendance.tracking.failedToLoad")}</h3>
          <p className="text-muted-foreground mt-1">
            {error instanceof Error ? error.message : t("attendance.tracking.errorOccurred")}
          </p>
          <Button variant="outline" onClick={() => refetch()} className="mt-4">
            <RefreshCw className="size-4 mr-2" />
            {t("common.retry")}
          </Button>
        </div>
      ) : view === "daysoff" ? (
        <TrackingDaysOff daysOff={daysOff} canReconcile={canReconcile} isAdmin={isAdmin} />
      ) : filteredEntries.length === 0 ? (
        <div className="p-12 text-center">
          <Clock className="size-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">{t("attendance.tracking.noRecords")}</h3>
          <p className="text-muted-foreground mt-1">
            {selectedLocationId === "all"
              ? t("attendance.tracking.selectLocationHint")
              : t("attendance.tracking.noEntriesHint")}
          </p>
        </div>
      ) : (
        <TrackingEntriesTable
          entries={filteredEntries}
          canReconcile={canReconcile}
          isAdmin={isAdmin}
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
