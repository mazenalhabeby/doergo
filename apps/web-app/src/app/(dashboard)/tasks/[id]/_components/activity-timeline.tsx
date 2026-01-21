"use client"

import { useQuery } from "@tanstack/react-query"
import {
  Clock,
  UserPlus,
  UserMinus,
  PlayCircle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Paperclip,
  AlertTriangle,
  MapPin,
  FileEdit,
} from "lucide-react"

import { tasksApi, type TaskEvent } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface ActivityTimelineProps {
  taskId: string
}

const EVENT_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  CREATED: { icon: Clock, color: "text-blue-500", label: "Task created" },
  UPDATED: { icon: FileEdit, color: "text-gray-500", label: "Task updated" },
  ASSIGNED: { icon: UserPlus, color: "text-purple-500", label: "Technician assigned" },
  UNASSIGNED: { icon: UserMinus, color: "text-orange-500", label: "Technician unassigned" },
  STATUS_CHANGED: { icon: PlayCircle, color: "text-amber-500", label: "Status changed" },
  EN_ROUTE: { icon: MapPin, color: "text-cyan-500", label: "Technician en route" },
  ARRIVED: { icon: MapPin, color: "text-teal-500", label: "Technician arrived" },
  IN_PROGRESS: { icon: PlayCircle, color: "text-amber-500", label: "Work in progress" },
  BLOCKED: { icon: AlertTriangle, color: "text-red-500", label: "Task blocked" },
  COMPLETED: { icon: CheckCircle2, color: "text-green-500", label: "Task completed" },
  CANCELED: { icon: XCircle, color: "text-red-500", label: "Task canceled" },
  CLOSED: { icon: CheckCircle2, color: "text-gray-500", label: "Task closed" },
  COMMENT_ADDED: { icon: MessageSquare, color: "text-blue-500", label: "Comment added" },
  ATTACHMENT_ADDED: { icon: Paperclip, color: "text-indigo-500", label: "Attachment added" },
  ATTACHMENT_REMOVED: { icon: Paperclip, color: "text-red-500", label: "Attachment removed" },
}

function getEventConfig(eventType: string) {
  return EVENT_CONFIG[eventType] || EVENT_CONFIG.UPDATED
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function getEventDescription(event: TaskEvent): string {
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
    if (workerName) return `Assigned to ${workerName}`
  }

  if (event.eventType === "COMMENT_ADDED" && metadata) {
    const content = metadata.content as string | undefined
    if (content) {
      return `"${content.length > 35 ? content.slice(0, 35) + "..." : content}"`
    }
  }

  if (event.eventType === "UPDATED" && metadata) {
    const changes = metadata.changes as Record<string, unknown> | undefined
    if (changes) {
      const fields = Object.keys(changes).filter(k => k !== "userId" && k !== "userRole" && k !== "organizationId")
      if (fields.length > 0) {
        return `Updated ${fields.join(", ")}`
      }
    }
  }

  return getEventConfig(event.eventType).label
}

export function ActivityTimeline({ taskId }: ActivityTimelineProps) {
  const { data: events, isLoading, isError } = useQuery({
    queryKey: ["taskTimeline", taskId],
    queryFn: () => tasksApi.getTimeline(taskId),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return (
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
    )
  }

  if (isError || !events || events.length === 0) {
    return (
      <div className="text-center py-4">
        <Clock className="size-6 text-gray-300 mx-auto mb-1" />
        <p className="text-xs text-gray-400">No activity yet</p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="absolute left-2.5 top-2 bottom-2 w-px bg-gray-200" />

      <div className="space-y-3">
        {events.map((event) => {
          const config = getEventConfig(event.eventType)
          const Icon = config.icon

          return (
            <div key={event.id} className="relative flex gap-2.5 pl-0">
              <div className="relative z-10 size-5 rounded-full bg-white flex items-center justify-center ring-2 ring-gray-100">
                <Icon className={cn("size-3", config.color)} />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-xs text-gray-900 leading-tight">
                  {getEventDescription(event)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {event.user.firstName} {event.user.lastName} · {formatTimeAgo(event.createdAt)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
