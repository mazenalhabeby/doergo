"use client"

import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ChevronRight, MapPin, Calendar, User, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { getStatusConfig, getPriorityConfig } from "@/lib/constants"

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
  if (tasks.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16", className)}>
        <div className="mb-4 rounded-full bg-slate-100 p-4">
          <Inbox className="size-6 text-slate-400" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium text-slate-600">No tasks yet</p>
        <p className="mt-1 text-[13px] text-slate-400">
          Tasks will appear here once created
        </p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-1", className)}>
      {tasks.map((task) => {
        const statusConfig = getStatusConfig(task.status)
        const priorityConfig = getPriorityConfig(task.priority)

        return (
          <Link
            key={task.id}
            href={`/tasks/${task.id}`}
            className={cn(
              "group flex items-center gap-4 rounded-xl p-4 -mx-2",
              "transition-all duration-200",
              "hover:bg-slate-50"
            )}
          >
            {/* Priority indicator */}
            <div
              className={cn("w-1 h-12 rounded-full shrink-0", priorityConfig.dotColor)}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-sm font-medium text-slate-900 truncate">
                  {task.title}
                </span>
                <span className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium",
                  statusConfig.bgClass,
                  statusConfig.textClass
                )}>
                  {statusConfig.label}
                </span>
              </div>
              <div className="flex items-center gap-4 text-[13px] text-slate-400">
                {task.assignee && (
                  <span className="flex items-center gap-1">
                    <User className="size-3" strokeWidth={1.5} />
                    {task.assignee.name}
                  </span>
                )}
                {task.dueDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" strokeWidth={1.5} />
                    {formatDistanceToNow(task.dueDate, { addSuffix: true })}
                  </span>
                )}
                {task.location && (
                  <span className="flex items-center gap-1 truncate max-w-[140px]">
                    <MapPin className="size-3" strokeWidth={1.5} />
                    {task.location}
                  </span>
                )}
              </div>
            </div>

            {/* Arrow */}
            <ChevronRight className="size-4 text-slate-300 transition-all group-hover:text-slate-400 group-hover:translate-x-0.5" strokeWidth={1.5} />
          </Link>
        )
      })}

      {showViewAll && (
        <Link
          href="/tasks"
          className="block pt-3 text-center text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          View all tasks
        </Link>
      )}
    </div>
  )
}
