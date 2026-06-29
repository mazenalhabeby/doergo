"use client"

import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  Clock,
  UserPlus,
  UserMinus,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Paperclip,
  AlertTriangle,
  MapPin,
  FileEdit,
} from "lucide-react"

import { tasksApi, type TaskEvent } from "@/lib/api"
import { cn, formatTimeAgo } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface ActivitySectionProps {
  taskId: string
}

const EVENT_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; labelKey: string }
> = {
  CREATED: { icon: Clock, color: "text-blue-500", labelKey: "tasks.activity.events.CREATED" },
  UPDATED: { icon: FileEdit, color: "text-muted-foreground", labelKey: "tasks.activity.events.UPDATED" },
  ASSIGNED: { icon: UserPlus, color: "text-purple-500", labelKey: "tasks.activity.events.ASSIGNED" },
  UNASSIGNED: { icon: UserMinus, color: "text-orange-500", labelKey: "tasks.activity.events.UNASSIGNED" },
  STATUS_CHANGED: { icon: PlayCircle, color: "text-amber-500", labelKey: "tasks.activity.events.STATUS_CHANGED" },
  EN_ROUTE: { icon: MapPin, color: "text-cyan-500", labelKey: "tasks.activity.events.EN_ROUTE" },
  ARRIVED: { icon: MapPin, color: "text-teal-500", labelKey: "tasks.activity.events.ARRIVED" },
  IN_PROGRESS: { icon: PlayCircle, color: "text-amber-500", labelKey: "tasks.activity.events.IN_PROGRESS" },
  BLOCKED: { icon: AlertTriangle, color: "text-red-500", labelKey: "tasks.activity.events.BLOCKED" },
  COMPLETED: { icon: CheckCircle2, color: "text-green-500", labelKey: "tasks.activity.events.COMPLETED" },
  CANCELED: { icon: XCircle, color: "text-red-500", labelKey: "tasks.activity.events.CANCELED" },
  CLOSED: { icon: CheckCircle2, color: "text-muted-foreground", labelKey: "tasks.activity.events.CLOSED" },
  ATTACHMENT_ADDED: { icon: Paperclip, color: "text-indigo-500", labelKey: "tasks.activity.events.ATTACHMENT_ADDED" },
  ATTACHMENT_REMOVED: { icon: Paperclip, color: "text-red-500", labelKey: "tasks.activity.events.ATTACHMENT_REMOVED" },
}

const EXCLUDED_EVENTS = ["COMMENT_ADDED"]

function getEventConfig(eventType: string) {
  return EVENT_CONFIG[eventType] || EVENT_CONFIG.UPDATED
}

function getEventDescription(event: TaskEvent, t: (key: string, options?: Record<string, unknown>) => string): string {
  const metadata = event.metadata as Record<string, unknown> | null

  if (event.eventType === "STATUS_CHANGED" && metadata) {
    const oldStatus = metadata.oldStatus as string | undefined
    const newStatus = metadata.newStatus as string | undefined
    const reason = metadata.reason as string | undefined
    if (oldStatus && newStatus) {
      const desc = `${oldStatus.replace(/_/g, " ")} → ${newStatus.replace(/_/g, " ")}`
      if (reason && newStatus === "BLOCKED") {
        return `${desc}: ${reason.length > 30 ? reason.slice(0, 30) + "..." : reason}`
      }
      return desc
    }
  }

  if (event.eventType === "ASSIGNED" && metadata) {
    const workerName = metadata.workerName as string | undefined
    if (workerName) return t("tasks.activity.assignedTo", { name: workerName })
  }

  if (event.eventType === "UPDATED" && metadata) {
    const changes = metadata.changes as Record<string, unknown> | undefined
    if (changes) {
      const fields = Object.keys(changes).filter(k => k !== "userId" && k !== "userRole" && k !== "organizationId")
      if (fields.length > 0) {
        return t("tasks.activity.updatedFields", { fields: fields.join(", ") })
      }
    }
  }

  return t(getEventConfig(event.eventType).labelKey)
}

export function ActivitySection({ taskId }: ActivitySectionProps) {
  const { t } = useTranslation()
  const { data: events, isLoading, isError } = useQuery({
    queryKey: ["taskTimeline", taskId],
    queryFn: () => tasksApi.getTimeline(taskId),
  })

  const filteredEvents = events?.filter(
    (event) => !EXCLUDED_EVENTS.includes(event.eventType)
  ) || []

  const activityCount = filteredEvents.length

  return (
    <div className="bg-card rounded-2xl shadow-sm h-[400px] flex flex-col">
      <div className="p-6 border-b border-border shrink-0 flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          {t('tasks.activity.title')}
        </h3>
        {activityCount > 0 && (
          <span className="px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-full">
            {activityCount}
          </span>
        )}
      </div>

      <div className="p-6 overflow-y-auto flex-1">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="size-5 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : isError || filteredEvents.length === 0 ? (
          <div className="text-center py-4">
            <Clock className="size-6 text-muted-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">{t('tasks.activity.noActivity')}</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-2.5 top-2 bottom-2 w-px bg-muted" />

            <div className="space-y-3">
              {filteredEvents.map((event) => {
                const config = getEventConfig(event.eventType)
                const Icon = config.icon

                return (
                  <div key={event.id} className="relative flex gap-2.5 pl-0">
                    <div className="relative z-10 size-5 rounded-full bg-card flex items-center justify-center ring-2 ring-border">
                      <Icon className={cn("size-3", config.color)} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-xs text-foreground leading-tight">
                        {getEventDescription(event, t)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {event.user.firstName} {event.user.lastName} · {formatTimeAgo(event.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
