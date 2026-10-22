import React from "react"
import { cn } from "@/lib/utils"
import { type TimeEntry } from "@/lib/api"
import { ListPager } from "@/components/ui/list-pager"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChevronRight, ListChecks } from "lucide-react"
import { WorkLogTimeline } from "@/components/attendance/worklog-timeline"
import { StatusBadge, WorkerCell, ClockCell, ApprovalCell } from "../../../../components/attendance/attendance-helpers"
import { formatDuration, personName } from "@hbcfield/shared/client"
import { EditEntryDialog } from "./edit-entry-dialog"
import { AddOvertimeDialog } from "../../../../components/attendance/add-overtime-dialog"
import { PresenceDay } from "@/components/attendance/presence-day"
import { workedMinutes } from "@hbcfield/shared/client"
import { SortHead } from "./sort-head"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"
import { useOvertimeAction } from "@/hooks/use-overtime-action"
import type { TrackingTabProps } from "./tracking-types"

/**
 * The clock entries, one row each — opens to the day's presence and work log. The row's actions
 * follow the permissions their routes ask: correct (canReconcile), delete (canDelete), overtime.
 */
export function TrackingEntriesTable({
  entries,
  canReconcile,
  canDelete,
  isAdmin,
  sort,
  onSort,
  meta,
  page,
  limit,
  setPage,
}: Pick<
  TrackingTabProps,
  "canReconcile" | "canDelete" | "isAdmin" | "sort" | "onSort" | "meta" | "page" | "limit" | "setPage"
> & {
  entries: TrackingTabProps["filteredEntries"]
}) {
  const { t } = useTranslation()
  const { hour12, locale } = useTimeFormat()
  // Overtime on a closed shift: the approval permission and the Option its route
  // is sold under — one gate, shared with the member's attendance tab.
  const overtime = useOvertimeAction()
  // The entry dialog opens for whoever may correct OR delete; it shows each
  // half only to the permission its route asks.
  const canOpenEntry = canReconcile || canDelete
  const showActions = canOpenEntry || overtime.enabled
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  return (
    <>
      <>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/80">
              <SortHead
                label={t("attendance.worker")}
                active={sort?.key === "worker"}
                dir={sort?.dir ?? "asc"}
                onClick={() => onSort("worker")}
              />
              <SortHead
                label={t("common.status")}
                active={sort?.key === "status"}
                dir={sort?.dir ?? "asc"}
                onClick={() => onSort("status")}
              />
              <SortHead
                label={t("attendance.clockIn")}
                active={sort?.key === "clockIn"}
                dir={sort?.dir ?? "asc"}
                onClick={() => onSort("clockIn")}
              />
              <SortHead
                label={t("attendance.clockOut")}
                active={sort?.key === "clockOut"}
                dir={sort?.dir ?? "asc"}
                onClick={() => onSort("clockOut")}
              />
              <SortHead
                label={t("common.duration")}
                active={sort?.key === "duration"}
                dir={sort?.dir ?? "asc"}
                onClick={() => onSort("duration")}
              />
              <SortHead
                label={t("attendance.approval")}
                active={sort?.key === "approval"}
                dir={sort?.dir ?? "asc"}
                onClick={() => onSort("approval")}
              />
              <TableHead className="font-semibold text-muted-foreground">{t("worklog.column", "Activity")}</TableHead>
              {showActions && <TableHead className="w-10 text-right" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry: TimeEntry) => {
              const isOpen = expandedId === entry.id
              return (
                <React.Fragment key={entry.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => setExpandedId(isOpen ? null : entry.id)}
                  >
                    <TableCell>
                      <WorkerCell entry={entry} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={entry.status} />
                    </TableCell>
                    <TableCell>
                      <ClockCell
                        at={entry.clockInAt}
                        tz={entry.timezone ?? entry.location?.timezone}
                        hour12={hour12}
                        locale={locale}
                      />
                    </TableCell>
                    <TableCell>
                      <ClockCell
                        at={entry.clockOutAt}
                        tz={entry.timezone ?? entry.location?.timezone}
                        hour12={hour12}
                        locale={locale}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{formatDuration(workedMinutes(entry))}</span>
                    </TableCell>
                    <TableCell>
                      <ApprovalCell entry={entry} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ListChecks className="h-4 w-4 shrink-0" />
                        <span>{t("worklog.view", "View")}</span>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            isOpen && "rotate-90",
                          )}
                        />
                      </div>
                    </TableCell>
                    {showActions && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {overtime.canOfferFor(entry) && <AddOvertimeDialog entry={entry} />}
                          {canOpenEntry && (
                            <EditEntryDialog entry={entry} canEdit={canReconcile} canDelete={canDelete} />
                          )}
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
                        <div
                          className={
                            "mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase " +
                            "tracking-wide text-muted-foreground"
                          }
                        >
                          <ListChecks className="h-3.5 w-3.5" /> {t("worklog.title", "Activity — what they did")}
                        </div>
                        {/* Managers/admins can add & edit a member's activity (with photos). */}
                        <WorkLogTimeline
                          entryId={entry.id}
                          editable={isAdmin}
                          memberName={personName(entry.user) || undefined}
                          clockOutNote={entry.notes}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>

        {meta && (
          <ListPager
            page={page}
            totalPages={meta.totalPages}
            setPage={setPage}
            label={t("attendance.tracking.showingEntries", {
              start: (page - 1) * limit + 1,
              end: Math.min(page * limit, meta.total),
              total: meta.total,
            })}
          />
        )}
      </>
    </>
  )
}
