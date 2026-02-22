"use client"

import { format } from "date-fns"
import { Clock } from "lucide-react"

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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance History</CardTitle>
        <CardDescription>
          Clock-in/out records for this technician
        </CardDescription>
      </CardHeader>
      <CardContent>
        {attendance && attendance.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
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
                      <Badge className="bg-green-100 text-green-700">In Zone</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700">
                        Out of Zone
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <Clock className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p>No attendance records found</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
