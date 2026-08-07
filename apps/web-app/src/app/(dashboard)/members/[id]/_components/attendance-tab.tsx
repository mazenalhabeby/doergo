"use client"

import { format } from "date-fns"
import { Clock } from "lucide-react"
import { useTranslation } from "react-i18next"

import { type TimeEntry } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AddAttendanceDialog } from "./add-attendance-dialog"
import { useTimeFormat } from "@/hooks"
import { countryFromTz } from "@hbcfield/shared/client"

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
  const { formatTime, locale } = useTimeFormat()

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{t('technicians.attendanceTab.title')}</CardTitle>
          <CardDescription>
            {t('technicians.attendanceTab.description')}
          </CardDescription>
        </div>
        {canManage && (
          <AddAttendanceDialog
            employeeId={employeeId}
            employeeName={employeeName}
          />
        )}
      </CardHeader>
      <CardContent>
        {attendance && attendance.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('technicians.attendanceTab.dateColumn')}</TableHead>
                <TableHead>{t('technicians.attendanceTab.clockInColumn')}</TableHead>
                <TableHead>{t('technicians.attendanceTab.clockOutColumn')}</TableHead>
                <TableHead>{t('technicians.attendanceTab.durationColumn')}</TableHead>
                <TableHead>{t('technicians.attendanceTab.locationColumn')}</TableHead>
                <TableHead>{t('technicians.attendanceTab.statusColumn')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendance.map((entry: TimeEntry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div>
                      {format(new Date(entry.clockInAt), "MMM d, yyyy")}
                      {countryFromTz((entry.timezone ?? entry.location?.timezone), locale)
                        ? ` / ${countryFromTz((entry.timezone ?? entry.location?.timezone), locale)}`
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatTime(entry.clockInAt, (entry.timezone ?? entry.location?.timezone))}
                  </TableCell>
                  <TableCell>
                    {entry.clockOutAt
                      ? formatTime(entry.clockOutAt, (entry.timezone ?? entry.location?.timezone))
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {entry.totalMinutes
                      ? `${Math.floor(entry.totalMinutes / 60)}h ${entry.totalMinutes % 60}m`
                      : "—"}
                  </TableCell>
                  <TableCell>{entry.location?.name || "—"}</TableCell>
                  <TableCell>
                    {entry.clockInWithinGeofence ? (
                      <Badge className="bg-green-500/15 text-green-600 dark:text-green-400">{t('technicians.attendanceTab.inZone')}</Badge>
                    ) : (
                      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        {t('technicians.attendanceTab.outOfZone')}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p>{t('technicians.attendanceTab.noRecords')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
