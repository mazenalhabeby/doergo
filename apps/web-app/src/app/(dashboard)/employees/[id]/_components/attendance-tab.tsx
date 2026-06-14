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

interface AttendanceTabProps {
  attendance: TimeEntry[] | undefined
}

export function AttendanceTab({ attendance }: AttendanceTabProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('technicians.attendanceTab.title')}</CardTitle>
        <CardDescription>
          {t('technicians.attendanceTab.description')}
        </CardDescription>
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
                    {format(new Date(entry.clockInAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    {format(new Date(entry.clockInAt), "h:mm a")}
                  </TableCell>
                  <TableCell>
                    {entry.clockOutAt
                      ? format(new Date(entry.clockOutAt), "h:mm a")
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
