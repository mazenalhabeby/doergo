"use client"

import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Inbox } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { getStatusConfig } from "@/lib/constants"

export interface RecentTask {
  id: string
  title: string
  status: string
  priority: string
  dueDate?: Date
  location?: string
  assignee?: {
    name: string
  }
  createdAt: Date
}

interface RecentTasksProps {
  tasks: RecentTask[]
  className?: string
  showViewAll?: boolean
}

export function RecentTasks({ tasks, className, showViewAll = true }: RecentTasksProps) {
  const { t } = useTranslation()
  if (tasks.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16", className)}>
        <div className="mb-4 rounded-full bg-muted p-4">
          <Inbox className="size-6 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{t('dashboard.recentTasksWidget.noTasks')}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t('dashboard.recentTasksWidget.willAppear')}
        </p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      {tasks.map((task) => {
        const statusConfig = getStatusConfig(task.status)
        const hex = statusConfig.hex
        const meta = [
          task.location,
          task.dueDate ? formatDistanceToNow(task.dueDate, { addSuffix: true }) : null,
          task.assignee?.name,
        ].filter(Boolean) as string[]

        return (
          <Link
            key={task.id}
            href={`/tasks/${task.id}`}
            className={cn(
              "group block rounded-2xl bg-card p-4",
              "border border-border/50 shadow-sm",
              "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
            )}
          >
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {task.title}
              </p>
              <span
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ backgroundColor: `${hex}14`, color: hex }}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: hex }} />
                {statusConfig.label}
              </span>
            </div>
            {meta.length > 0 && (
              <p className="mt-1.5 truncate text-xs text-muted-foreground">
                {meta.join("  ·  ")}
              </p>
            )}
          </Link>
        )
      })}

      {showViewAll && (
        <Link
          href="/tasks"
          className="block pt-3 text-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('dashboard.recentTasksWidget.viewAllTasks')}
        </Link>
      )}
    </div>
  )
}
