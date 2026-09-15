"use client"

import { Fragment, useState } from "react"
import { Clock, ChevronRight, ListChecks } from "lucide-react"
import { useTranslation } from "react-i18next"

import { type TimeEntry } from "@/lib/api"
import { AddAttendanceDialog } from "./add-attendance-dialog"
import { AddOvertimeDialog } from "../../../attendance/_components/add-overtime-dialog"
import { useOvertimeAction } from "@/hooks/use-overtime-action"
import { AttendanceStatusCell } from "@/components/attendance-status-cell"
import { WorkLogTimeline } from "@/components/worklog-timeline"
import { useTimeFormat } from "@/hooks"
import { cn, formatDurationMinutes } from "@/lib/utils"
import { countryFromTz, workedMinutes } from "@hbcfield/shared/client"

interface AttendanceTabProps {
  attendance: TimeEntry[] | undefined
  employeeId: string
  employeeName?: string
  canManage?: boolean
}

export function AttendanceTab({
  attendance,
  employeeId,
  employeeName,
  canManage,
}: AttendanceTabProps) {
  const { t } = useTranslation()
  const { formatTime, formatDate, locale } = useTimeFormat()
  const [expanded, setExpanded] = useState<string | null>(null)
  /*
    "Add overtime" on a closed shift, with the SAME gate and dialog as the
    attendance board. A manager opens the member first and finds the evening
    here; sending them to another page to approve it was the gap.

    Never on the viewer's own profile — approving your own hours is refused by
    the server, and a column of buttons that all fail is worse than no column.
  */
  const overtime = useOvertimeAction()
  const showOvertime = overtime.enabled && overtime.viewer.userId !== employeeId
  const columns = showOvertime ? 8 : 7

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Clock className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t('technicians.attendanceTab.title')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('technicians.attendanceTab.description')}
          </p>
        </div>
        {canManage && (
          <div className="ml-auto">
            <AddAttendanceDialog
              employeeId={employeeId}
              employeeName={employeeName}
            />
          </div>
        )}
      </div>

      {attendance && attendance.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('technicians.attendanceTab.dateColumn')}
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('technicians.attendanceTab.clockInColumn')}
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('technicians.attendanceTab.clockOutColumn')}
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('technicians.attendanceTab.durationColumn')}
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('technicians.attendanceTab.locationColumn')}
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('technicians.attendanceTab.statusColumn')}
                </th>
                {showOvertime && <th className="w-10 px-2 py-3" />}
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('worklog.column', 'Activity')}
                </th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((entry: TimeEntry) => {
                const tz = entry.timezone ?? entry.location?.timezone
                const country = countryFromTz(tz, locale)
                const isOpen = expanded === entry.id
                return (
                  <Fragment key={entry.id}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    className="cursor-pointer border-b border-border/60 hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-5 py-3 text-foreground">
                      {formatDate(entry.clockInAt, tz)}
                      {country ? ` / ${country}` : ""}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatTime(entry.clockInAt, tz)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {entry.clockOutAt ? formatTime(entry.clockOutAt, tz) : "—"}
                    </td>
                    {/*
                      The COUNTED hours, through the same helper every other
                      attendance screen reads.

                      This cell rendered `totalMinutes` — raw wall time, breaks
                      and all — while the attendance board rendered
                      `workedMinutes()`. The same shift therefore read 12h 10m
                      here and 11h 30m there, and whichever screen somebody
                      happened to open decided what they believed they were paid
                      for. The second line names the difference rather than
                      leaving two numbers to be discovered separately.
                    */}
                    <td className="px-5 py-3 text-foreground">
                      {entry.clockOutAt ? (
                        <>
                          <span className="font-medium tabular-nums">
                            {formatDurationMinutes(workedMinutes(entry))}
                          </span>
                          {entry.totalMinutes != null &&
                            workedMinutes(entry) !== entry.totalMinutes && (
                              <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                                {t("attendance.onSite", "{{duration}} on site", {
                                  duration: formatDurationMinutes(entry.totalMinutes),
                                })}
                              </span>
                            )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {entry.location?.name || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <AttendanceStatusCell entry={entry} />
                    </td>
                    {showOvertime && (
                      // The row expands on click; the action must not.
                      <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {overtime.canOfferFor(entry) && <AddOvertimeDialog entry={entry} />}
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border/60 bg-muted/20">
                      <td colSpan={columns} className="px-5 py-4">
                        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <ListChecks className="h-3.5 w-3.5" /> {t('worklog.title', "Activity — what they did")}
                        </div>
                        {/* Managers/admins responsible for this member can add & edit their activity. */}
                        <WorkLogTimeline entryId={entry.id} editable={canManage} memberName={employeeName} clockOutNote={entry.notes} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
            <Clock className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('technicians.attendanceTab.noRecords')}
          </p>
        </div>
      )}
    </div>
  )
}
