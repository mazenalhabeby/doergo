import React from "react"
import { format } from "date-fns"
import { UserAvatar } from "@/components/common/user-avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CheckCircle2, CalendarOff } from "lucide-react"
import { toDate, NoteCell } from "../../../../components/attendance/attendance-helpers"
import { personName } from "@hbcfield/shared/client"
import { EditDayOffDialog } from "./edit-dayoff-dialog"
import { useTranslation } from "react-i18next"
import type { DayOffRow } from "./tracking-types"

/** Approved time off in the range, as its own table — these rows never have clock times. */
export function TrackingDaysOff({
  daysOff,
  canReconcile,
  isAdmin,
}: {
  daysOff: DayOffRow[]
  canReconcile: boolean
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  return daysOff.length === 0 ? (
    <div className="p-12 text-center">
      <CalendarOff className="size-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-medium text-foreground">
        {t("attendance.daysOff.none", "No days off in this range")}
      </h3>
      <p className="text-muted-foreground mt-1">
        {t("attendance.daysOff.noneHint", "Approved time off for the selected dates shows here.")}
      </p>
    </div>
  ) : (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/80">
          <TableHead className="font-semibold text-muted-foreground">{t("attendance.worker")}</TableHead>
          <TableHead className="font-semibold text-muted-foreground">{t("attendance.daysOff.type", "Type")}</TableHead>
          <TableHead className="font-semibold text-muted-foreground">
            {t("attendance.daysOff.dates", "Dates")}
          </TableHead>
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
                  <UserAvatar
                    firstName={off.technician?.firstName}
                    lastName={off.technician?.lastName}
                    seed={off.technician?.id}
                    size="md"
                  />
                  <p className="font-medium text-foreground">{personName(off.technician)}</p>
                </div>
              </TableCell>
              <TableCell>
                <span
                  className={
                    "inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 " +
                    "text-xs font-medium text-violet-600 dark:text-violet-300"
                  }
                >
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
}
