"use client"

import { Fragment, useState } from "react"
import { Clock, ChevronRight, ListChecks } from "lucide-react"
import { useTranslation } from "react-i18next"

import { type TimeEntry } from "@/lib/api"
import { AddAttendanceDialog } from "../../../../../components/attendance/add-attendance-dialog"
import { AddOvertimeDialog } from "../../../../../components/attendance/add-overtime-dialog"
import { useOvertimeAction } from "@/hooks/use-overtime-action"
import { AttendanceStatusCell } from "@/components/attendance/attendance-status-cell"
import { WorkLogTimeline } from "@/components/attendance/worklog-timeline"
import { useTimeFormat } from "@/hooks"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/page/page-kit"
import { formatDuration, countryFromTz, workedMinutes } from "@hbcfield/shared/client"

interface AttendanceTabProps {
  attendance: TimeEntry[] | undefined
  employeeId: string
  employeeName?: string
  canManage?: boolean
  /** May add a missed day — the server's "correct hours" (C4). */
  canAddAttendance?: boolean
}

export function AttendanceTab({
  attendance,
  employeeId,
  employeeName,
  canManage,
  canAddAttendance,
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
    <Panel className="overflow-hidden p-0">
      {/* Header */}
      <div className="px-5 pb-2 pt-[18px] flex items-center gap-2.5">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-shell-accent-soft text-shell-accent">
          <Clock className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("technicians.attendanceTab.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("technicians.attendanceTab.description")}</p>
        </div>
        {canAddAttendance && (
          <div className="ml-auto">
            <AddAttendanceDialog employeeId={employeeId} employeeName={employeeName} />
          </div>
        )}
      </div>

      {attendance && attendance.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("technicians.attendanceTab.dateColumn")}
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("technicians.attendanceTab.clockInColumn")}
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("technicians.attendanceTab.clockOutColumn")}
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("technicians.attendanceTab.durationColumn")}
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("technicians.attendanceTab.locationColumn")}
                </th>
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("technicians.attendanceTab.statusColumn")}
                </th>
                {showOvertime && <th className="w-10 px-2 py-3" />}
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("worklog.column", "Activity")}
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
                      className="cursor-pointer border-b border-border hover:bg-accent transition-colors"
                    >
                      <td className="px-5 py-3 text-foreground">
                        {formatDate(entry.clockInAt, tz)}
                        {country ? ` / ${country}` : ""}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{formatTime(entry.clockInAt, tz)}</td>
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
                            <span className="font-medium tabular-nums">{formatDuration(workedMinutes(entry))}</span>
                            {entry.totalMinutes != null && workedMinutes(entry) !== entry.totalMinutes && (
                              <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                                {t("attendance.onSite", "{{duration}} on site", {
                                  duration: formatDuration(entry.totalMinutes),
                                })}
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{entry.location?.name || "—"}</td>
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
                        <ChevronRight
                          className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-90")}
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border bg-muted/20">
                        <td colSpan={columns} className="px-5 py-4">
                          <div
                            className={
                              "mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase " +
                              "tracking-wide text-muted-foreground"
                            }
                          >
                            <ListChecks className="h-3.5 w-3.5" /> {t("worklog.title", "Activity — what they did")}
                          </div>
                          {/* Managers/admins responsible for this member can add & edit their activity. */}
                          <WorkLogTimeline
                            entryId={entry.id}
                            editable={canManage}
                            memberName={employeeName}
                            clockOutNote={entry.notes}
                          />
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
          <p className="text-sm text-muted-foreground">{t("technicians.attendanceTab.noRecords")}</p>
        </div>
      )}
    </Panel>
  )
}
