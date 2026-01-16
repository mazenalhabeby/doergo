"use client"

import { formatDistanceToNow } from "date-fns"
import {
  CheckCircle2,
  Circle,
  MessageSquare,
  UserPlus,
  AlertCircle,
  Play,
  FileText,
  LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface ActivityItem {
  id: string
  type: "task_created" | "task_assigned" | "task_started" | "task_completed" | "task_blocked" | "comment_added" | "attachment_added"
  title: string
  description: string
  timestamp: Date
  user?: {
    name: string
  }
}

const activityConfig: Record<
  ActivityItem["type"],
  { icon: LucideIcon; color: string }
> = {
  task_created: { icon: FileText, color: "text-slate-400" },
  task_assigned: { icon: UserPlus, color: "text-slate-400" },
  task_started: { icon: Play, color: "text-slate-400" },
  task_completed: { icon: CheckCircle2, color: "text-emerald-500" },
  task_blocked: { icon: AlertCircle, color: "text-amber-500" },
  comment_added: { icon: MessageSquare, color: "text-slate-400" },
  attachment_added: { icon: FileText, color: "text-slate-400" },
}

interface ActivityFeedProps {
  activities: ActivityItem[]
  maxItems?: number
  className?: string
}

export function ActivityFeed({ activities, maxItems = 5, className }: ActivityFeedProps) {
  const displayActivities = activities.slice(0, maxItems)

  if (displayActivities.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12", className)}>
        <Circle className="mb-3 size-8 text-slate-200" strokeWidth={1.5} />
        <p className="text-sm text-slate-400">No recent activity</p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-0", className)}>
      {displayActivities.map((activity, index) => {
        const config = activityConfig[activity.type]
        const Icon = config.icon

        return (
          <div
            key={activity.id}
            className={cn(
              "group relative flex gap-4 py-4",
              index !== displayActivities.length - 1 && "border-b border-slate-100"
            )}
          >
            {/* Icon */}
            <div className="flex size-8 shrink-0 items-center justify-center">
              <Icon className={cn("size-4", config.color)} strokeWidth={1.5} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm text-slate-700 leading-snug">
                {activity.title}
              </p>
              <p className="text-[13px] text-slate-400">
                {activity.user && (
                  <span className="text-slate-500">{activity.user.name} · </span>
                )}
                {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
