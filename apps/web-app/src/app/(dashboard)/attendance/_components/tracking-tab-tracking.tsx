import React from "react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { type TimeEntry } from "@/lib/api"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  CalendarOff,
  ChevronRight,
  ListChecks,
} from "lucide-react"
import { WorkLogTimeline } from "@/components/worklog-timeline"
import { toDate, StatusBadge, WorkerCell, ClockCell, ApprovalCell, NoteCell } from "./attendance-helpers"
import { formatDuration, personName } from "@hbcfield/shared/client"
import { EditEntryDialog } from "./edit-entry-dialog"
import { AddOvertimeDialog } from "./add-overtime-dialog"
import { EditDayOffDialog } from "./edit-dayoff-dialog"
import { PresenceDay } from "@/components/attendance/presence-day"
import { workedMinutes } from "@hbcfield/shared/client"
import { SortHead } from "./tracking-tab-helpers"
import type { TrackingTabState } from "./use-tracking-tab"
import type { TrackingTab } from "./tracking-tab"

/** Part of TrackingTab's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TrackingTabTracking({ vm, loadingEntries, loadingLocations, isError, error, refetch, daysOff, canReconcile, isAdmin, filteredEntries, selectedLocationId, sort, onSort, canDelete, meta, page, limit, setPage }: { vm: TrackingTabState; loadingEntries: Parameters<typeof TrackingTab>[0]['loadingEntries']; loadingLocations: Parameters<typeof TrackingTab>[0]['loadingLocations']; isError: Parameters<typeof TrackingTab>[0]['isError']; error: Parameters<typeof TrackingTab>[0]['error']; refetch: Parameters<typeof TrackingTab>[0]['refetch']; daysOff: Parameters<typeof TrackingTab>[0]['daysOff']; canReconcile: Parameters<typeof TrackingTab>[0]['canReconcile']; isAdmin: Parameters<typeof TrackingTab>[0]['isAdmin']; filteredEntries: Parameters<typeof TrackingTab>[0]['filteredEntries']; selectedLocationId: Parameters<typeof TrackingTab>[0]['selectedLocationId']; sort: Parameters<typeof TrackingTab>[0]['sort']; onSort: Parameters<typeof TrackingTab>[0]['onSort']; canDelete: Parameters<typeof TrackingTab>[0]['canDelete']; meta: Parameters<typeof TrackingTab>[0]['meta']; page: Parameters<typeof TrackingTab>[0]['page']; limit: Parameters<typeof TrackingTab>[0]['limit']; setPage: Parameters<typeof TrackingTab>[0]['setPage'] }) {
  const {
    t,
    effectiveView,
    showActions,
    expandedId,
    setExpandedId,
    hour12,
    locale,
    overtime,
    canOpenEntry,
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
        daysOff.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarOff className="size-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">{t("attendance.daysOff.none", "No days off in this range")}</h3>
            <p className="text-muted-foreground mt-1">{t("attendance.daysOff.noneHint", "Approved time off for the selected dates shows here.")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/80">
                <TableHead className="font-semibold text-muted-foreground">{t("attendance.worker")}</TableHead>
                <TableHead className="font-semibold text-muted-foreground">{t("attendance.daysOff.type", "Type")}</TableHead>
                <TableHead className="font-semibold text-muted-foreground">{t("attendance.daysOff.dates", "Dates")}</TableHead>
                <TableHead className="font-semibold text-muted-foreground">{t("common.duration")}</TableHead>
                <TableHead className="font-semibold text-muted-foreground">{t("attendance.approval")}</TableHead>
                <TableHead className="font-semibold text-muted-foreground">{t("attendance.notes")}</TableHead>
                {canReconcile && <TableHead className="w-10 text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {daysOff.map((off) => {
                const rs = toDate(off.startDate)
                const re = toDate(off.endDate)
                const single = format(rs, "yyyy-MM-dd") === format(re, "yyyy-MM-dd")
                const days = Math.max(1, Math.round((re.getTime() - rs.getTime()) / 86_400_000) + 1)
                return (
                  <TableRow key={`off-${off.id}`} className="hover:bg-violet-500/10">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar firstName={off.technician?.firstName} lastName={off.technician?.lastName} seed={off.technician?.id} size="md" />
                        <p className="font-medium text-foreground">
                          {personName(off.technician)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-300">
                        <CalendarOff className="size-3.5" />
                        {t("attendance.dayOff.label")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground">
                        {single ? format(rs, "MMM d") : `${format(rs, "MMM d")} – ${format(re, "MMM d")}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {days} {days === 1 ? t("attendance.dayOff.day") : t("attendance.dayOff.days")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium">
                        <CheckCircle2 className="size-3.5" />
                        {t("common.approved")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <NoteCell note={off.reason} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <EditDayOffDialog dayOff={off} />
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )
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
        <>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/80">
                <SortHead label={t("attendance.worker")} active={sort?.key === "worker"} dir={sort?.dir ?? "asc"} onClick={() => onSort("worker")} />
                <SortHead label={t("common.status")} active={sort?.key === "status"} dir={sort?.dir ?? "asc"} onClick={() => onSort("status")} />
                <SortHead label={t("attendance.clockIn")} active={sort?.key === "clockIn"} dir={sort?.dir ?? "asc"} onClick={() => onSort("clockIn")} />
                <SortHead label={t("attendance.clockOut")} active={sort?.key === "clockOut"} dir={sort?.dir ?? "asc"} onClick={() => onSort("clockOut")} />
                <SortHead label={t("common.duration")} active={sort?.key === "duration"} dir={sort?.dir ?? "asc"} onClick={() => onSort("duration")} />
                <SortHead label={t("attendance.approval")} active={sort?.key === "approval"} dir={sort?.dir ?? "asc"} onClick={() => onSort("approval")} />
                <TableHead className="font-semibold text-muted-foreground">{t("worklog.column", "Activity")}</TableHead>
                {showActions && <TableHead className="w-10 text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry: TimeEntry) => {
                const isOpen = expandedId === entry.id
                return (
                <React.Fragment key={entry.id}>
                <TableRow className="cursor-pointer hover:bg-accent/50" onClick={() => setExpandedId(isOpen ? null : entry.id)}>
                  <TableCell>
                    <WorkerCell entry={entry} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={entry.status} />
                  </TableCell>
                  <TableCell>
                    <ClockCell at={entry.clockInAt} tz={entry.timezone ?? entry.location?.timezone} hour12={hour12} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <ClockCell at={entry.clockOutAt} tz={entry.timezone ?? entry.location?.timezone} hour12={hour12} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-foreground">
                      {formatDuration(workedMinutes(entry))}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ApprovalCell entry={entry} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ListChecks className="h-4 w-4 shrink-0" />
                      <span>{t("worklog.view", "View")}</span>
                      <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                    </div>
                  </TableCell>
                  {showActions && (
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {overtime.canOfferFor(entry) && <AddOvertimeDialog entry={entry} />}
                        {canOpenEntry && <EditEntryDialog entry={entry} canEdit={canReconcile} canDelete={canDelete} />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
                {isOpen && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={showActions ? 8 : 7} className="p-4">
                      <PresenceDay
                        entryId={entry.id}
                        clockInAt={entry.clockInAt}
                        clockOutAt={entry.clockOutAt}
                        timezone={entry.timezone ?? entry.location?.timezone}
                        hour12={hour12}
                        locale={locale}
                      />
                      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <ListChecks className="h-3.5 w-3.5" /> {t("worklog.title", "Activity — what they did")}
                      </div>
                      {/* Managers/admins can add & edit a member's activity (with photos). */}
                      <WorkLogTimeline entryId={entry.id} editable={isAdmin} memberName={personName(entry.user) || undefined} clockOutNote={entry.notes} />
                    </TableCell>
                  </TableRow>
                )}
                </React.Fragment>
                )
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                {t("attendance.tracking.showingEntries", {
                  start: (page - 1) * limit + 1,
                  end: Math.min(page * limit, meta.total),
                  total: meta.total,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  {t("common.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  disabled={page === meta.totalPages}
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
