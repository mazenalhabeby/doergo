"use client"

import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ClipboardList } from "lucide-react"

import { type Task } from "@/lib/api"
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
import { getStatusConfig } from "@/lib/constants"

interface TasksTabProps {
  tasks: Task[] | undefined
}

export function TasksTab({ tasks }: TasksTabProps) {
  const router = useRouter()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Task History</CardTitle>
        <CardDescription>
          All tasks assigned to this technician
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tasks && tasks.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task: Task) => {
                const statusConfig = getStatusConfig(task.status)
                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/tasks/${task.id}`)}
                  >
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>
                      <Badge className={statusConfig.bgClass}>
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{task.priority?.toLowerCase()}</TableCell>
                    <TableCell>
                      {task.dueDate
                        ? format(new Date(task.dueDate), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(task.createdAt), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p>No tasks found for this technician</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
