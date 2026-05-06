"use client"

import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ClipboardList } from "lucide-react"
import { useTranslation } from "react-i18next"

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
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('technicians.tasksTab.title')}</CardTitle>
        <CardDescription>
          {t('technicians.tasksTab.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tasks && tasks.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('technicians.tasksTab.taskColumn')}</TableHead>
                <TableHead>{t('technicians.tasksTab.statusColumn')}</TableHead>
                <TableHead>{t('technicians.tasksTab.priorityColumn')}</TableHead>
                <TableHead>{t('technicians.tasksTab.dueDateColumn')}</TableHead>
                <TableHead>{t('technicians.tasksTab.createdColumn')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task: Task) => {
                const statusConfig = getStatusConfig(task.status)
                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => router.push(`/tasks/${task.id}`)}
                  >
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>
                      <Badge className={statusConfig.className}>
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
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p>{t('technicians.tasksTab.noTasks')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
