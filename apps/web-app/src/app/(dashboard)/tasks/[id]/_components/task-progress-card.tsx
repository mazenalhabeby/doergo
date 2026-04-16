"use client"

import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import {
  Check,
  Clock,
  Wrench,
  Car,
  Phone,
  MessageSquare,
  Timer,
  MapPin,
  ClipboardList,
  UserPlus,
  UserCheck,
  CircleCheck,
} from "lucide-react"

import { tasksApi, type TaskEvent } from "@/lib/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn, formatTimeAgo, formatDurationMs } from "@/lib/utils"

interface AssignedUser {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  specialty?: string | null
}

interface TaskProgressCardProps {
  taskId: string
  assignedTo: AssignedUser
  isCompleted: boolean
  taskStatus: string
  createdAt: string
  routeStartedAt?: string | null
  routeEndedAt?: string | null
  routeDistance?: number | null
}

// Step configuration with icons - 6 steps for clear visibility
const STEPS = [
  { key: "submitted", labelKey: "tasks.progress.steps.submitted", icon: ClipboardList },
  { key: "assigned", labelKey: "tasks.progress.steps.assigned", icon: UserPlus },
  { key: "confirmed", labelKey: "tasks.progress.steps.confirmed", icon: UserCheck },
  { key: "en_route", labelKey: "tasks.progress.steps.enRoute", icon: Car },
  { key: "working", labelKey: "tasks.progress.steps.working", icon: Wrench },
  { key: "completed", labelKey: "tasks.progress.steps.completed", icon: CircleCheck },
]

// Map task status to step index
function getStepFromStatus(status: string): number {
  switch (status) {
    case "NEW":
    case "DRAFT":
      return 0
    case "ASSIGNED":
      return 1
    case "ACCEPTED":
      return 2
    case "EN_ROUTE":
      return 3
    case "ARRIVED":
    case "IN_PROGRESS":
    case "BLOCKED":
      return 4
    case "COMPLETED":
    case "CLOSED":
      return 5
    default:
      return 0
  }
}

// Estimate arrival time
function getEstimatedArrival(routeStartedAt: string | null, status: string): string | null {
  if (status === "ARRIVED" || status === "IN_PROGRESS" || status === "COMPLETED" || status === "CLOSED") {
    return null // Already arrived
  }
  if (!routeStartedAt || status !== "EN_ROUTE") {
    return null
  }
  // Estimate ~20 mins from start (mock ETA)
  const start = new Date(routeStartedAt)
  const eta = new Date(start.getTime() + 20 * 60 * 1000)
  const now = new Date()
  const diffMins = Math.max(0, Math.floor((eta.getTime() - now.getTime()) / 60000))

  if (diffMins <= 0) return "Any moment"
  if (diffMins < 60) return `~${diffMins} min`
  return `~${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
}

// Get step timestamp from events
function getStepTimestamp(events: TaskEvent[] | undefined, stepKey: string): string | null {
  if (!events) return null

  for (const event of events) {
    const metadata = event.metadata as Record<string, unknown> | null
    const newStatus = metadata?.newStatus as string

    switch (stepKey) {
      case "submitted":
        if (event.eventType === "CREATED") return event.createdAt
        break
      case "assigned":
        if (event.eventType === "ASSIGNED") return event.createdAt
        break
      case "confirmed":
        if (event.eventType === "STATUS_CHANGED" && newStatus === "ACCEPTED") {
          return event.createdAt
        }
        break
      case "en_route":
        if (event.eventType === "STATUS_CHANGED" && newStatus === "EN_ROUTE") {
          return event.createdAt
        }
        break
      case "working":
        if (event.eventType === "STATUS_CHANGED" && (newStatus === "ARRIVED" || newStatus === "IN_PROGRESS")) {
          return event.createdAt
        }
        break
      case "completed":
        if (event.eventType === "STATUS_CHANGED" && newStatus === "COMPLETED") {
          return event.createdAt
        }
        break
    }
  }
  return null
}

export function TaskProgressCard({
  taskId,
  assignedTo,
  isCompleted,
  taskStatus,
  createdAt,
  routeStartedAt,
  routeEndedAt,
  routeDistance,
}: TaskProgressCardProps) {
  const { t } = useTranslation()

  // Fetch timeline for real timestamps
  const { data: events } = useQuery({
    queryKey: ["taskTimeline", taskId],
    queryFn: () => tasksApi.getTimeline(taskId),
    refetchInterval: 30000,
  })

  // Calculate actual step from status
  const currentStep = getStepFromStatus(taskStatus)

  // Get status info for technician
  const getStatusInfo = () => {
    switch (taskStatus) {
      case "ASSIGNED":
        return {
          label: t("tasks.progress.status.pending"),
          sublabel: t("tasks.progress.status.waitingForAcceptance"),
          color: "text-amber-600",
          bgColor: "bg-amber-50",
          dotColor: "bg-amber-500",
          pulse: true,
        }
      case "ACCEPTED":
        return {
          label: t("tasks.progress.status.accepted"),
          sublabel: t("tasks.progress.status.readyToStart"),
          color: "text-blue-600",
          bgColor: "bg-blue-50",
          dotColor: "bg-blue-500",
          pulse: false,
        }
      case "EN_ROUTE":
        return {
          label: t("tasks.progress.status.onTheWay"),
          sublabel: t("tasks.progress.status.headingToLocation"),
          color: "text-blue-600",
          bgColor: "bg-blue-50",
          dotColor: "bg-blue-500",
          pulse: true,
        }
      case "ARRIVED":
        return {
          label: t("tasks.progress.status.onSite"),
          sublabel: t("tasks.progress.status.hasArrived"),
          color: "text-green-600",
          bgColor: "bg-green-50",
          dotColor: "bg-green-500",
          pulse: false,
        }
      case "IN_PROGRESS":
        return {
          label: t("tasks.progress.status.working"),
          sublabel: t("tasks.progress.status.inProgress"),
          color: "text-amber-600",
          bgColor: "bg-amber-50",
          dotColor: "bg-amber-500",
          pulse: true,
        }
      case "COMPLETED":
      case "CLOSED":
        return {
          label: t("tasks.progress.status.completed"),
          sublabel: t("tasks.progress.status.jobFinished"),
          color: "text-green-600",
          bgColor: "bg-green-50",
          dotColor: "bg-green-500",
          pulse: false,
        }
      case "BLOCKED":
        return {
          label: t("tasks.progress.status.blocked"),
          sublabel: t("tasks.progress.status.needsAttention"),
          color: "text-red-600",
          bgColor: "bg-red-50",
          dotColor: "bg-red-500",
          pulse: true,
        }
      default:
        return {
          label: t("tasks.progress.status.assigned"),
          sublabel: t("tasks.progress.status.waitingToStart"),
          color: "text-slate-600",
          bgColor: "bg-slate-50",
          dotColor: "bg-slate-400",
          pulse: false,
        }
    }
  }

  const statusInfo = getStatusInfo()
  const estimatedArrival = getEstimatedArrival(routeStartedAt || null, taskStatus)

  // Calculate elapsed time
  const getElapsedTime = () => {
    if (isCompleted && routeEndedAt && routeStartedAt) {
      const start = new Date(routeStartedAt).getTime()
      const end = new Date(routeEndedAt).getTime()
      return formatDurationMs(end - start)
    }
    if (routeStartedAt) {
      const start = new Date(routeStartedAt).getTime()
      const now = Date.now()
      return formatDurationMs(now - start)
    }
    return null
  }

  const elapsedTime = getElapsedTime()

  // Get title based on status
  const getTitle = () => {
    if (isCompleted) return t("tasks.progress.serviceCompletedSuccessfully")
    if (taskStatus === "BLOCKED") return t("tasks.progress.serviceRequiresAttention")
    if (taskStatus === "ASSIGNED") return t("tasks.progress.awaitingTechnicianAcceptance")
    if (taskStatus === "ACCEPTED") return t("tasks.progress.technicianAcceptedReadyToStart")
    if (taskStatus === "EN_ROUTE") return t("tasks.progress.technicianIsOnTheWay")
    if (taskStatus === "ARRIVED" || taskStatus === "IN_PROGRESS") return t("tasks.progress.workInProgress")
    return t("tasks.progress.yourServiceRequestIsActive")
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-6">
      {/* Header */}
      <div className={cn(
        "px-6 py-4 border-b border-slate-100",
        isCompleted ? "bg-gradient-to-r from-green-50 to-emerald-50" :
        taskStatus === "BLOCKED" ? "bg-gradient-to-r from-red-50 to-orange-50" :
        "bg-gradient-to-r from-blue-50 to-indigo-50"
      )}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            {getTitle()}
          </h3>
          {elapsedTime && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-lg border border-slate-200/60">
              <Timer className="size-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">{elapsedTime}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="flex gap-6">
          {/* Progress Steps - 70% */}
          <div className="w-[70%] pr-6 flex items-center">
            <div className="flex items-start justify-between w-full">
              {STEPS.map((step, index) => {
                const isActive = index === currentStep
                const isComplete = index < currentStep
                const isFuture = index > currentStep
                const Icon = step.icon
                const timestamp = getStepTimestamp(events, step.key)

                return (
                  <div key={step.key} className="flex flex-col items-center flex-1 relative">
                    {/* Connector line */}
                    {index < STEPS.length - 1 && (
                      <div className="absolute top-[19px] left-1/2 w-full h-0.5">
                        {/* Background track */}
                        <div className="w-full h-full bg-slate-200" />
                        {/* Progress fill */}
                        <div
                          className={cn(
                            "absolute top-0 left-0 h-full transition-all duration-500",
                            isComplete ? "w-full bg-blue-600" : "w-0"
                          )}
                        />
                      </div>
                    )}

                    {/* Step circle */}
                    <div
                      className={cn(
                        "relative z-10 size-10 rounded-full flex items-center justify-center transition-all duration-300",
                        isComplete && "bg-blue-600 text-white shadow-lg shadow-blue-600/25",
                        isActive && "bg-blue-600 text-white shadow-lg shadow-blue-600/25",
                        isFuture && "bg-slate-100 text-slate-400 border-2 border-slate-200"
                      )}
                    >
                      {isComplete ? (
                        <Check className="size-5 stroke-[2.5]" />
                      ) : (
                        <Icon className="size-5" />
                      )}

                      {/* Pulse animation for active step */}
                      {isActive && !isCompleted && (
                        <span className="absolute inset-0 rounded-full bg-blue-600 animate-ping opacity-25" />
                      )}
                    </div>

                    {/* Step label */}
                    <span
                      className={cn(
                        "text-xs mt-3 text-center font-medium max-w-[80px]",
                        isComplete || isActive ? "text-slate-900" : "text-slate-400"
                      )}
                    >
                      {t(step.labelKey)}
                    </span>

                    {/* Timestamp */}
                    {timestamp && (isComplete || isActive) && (
                      <span className="text-[10px] text-slate-400 mt-1">
                        {formatTimeAgo(timestamp)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Technician Card - 30% */}
          <div className="w-[30%] border-l border-slate-100 pl-6">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-4">
              {t("tasks.progress.assignedTechnician")}
            </p>

            {/* Two column layout */}
            <div className="flex gap-4 mb-4">
              {/* Left column - Avatar & Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-9 ring-2 ring-white shadow">
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-semibold">
                      {assignedTo.firstName[0]}
                      {assignedTo.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {assignedTo.firstName} {assignedTo.lastName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {assignedTo.specialty || t("tasks.progress.fieldTechnician")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right column - Status & ETA */}
              <div className="flex-1">
                {/* Status badge */}
                <div className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium mb-1.5",
                  statusInfo.bgColor,
                  statusInfo.color
                )}>
                  <span className="relative flex size-1.5">
                    <span className={cn(
                      "absolute inline-flex h-full w-full rounded-full opacity-75",
                      statusInfo.dotColor,
                      statusInfo.pulse && "animate-ping"
                    )} />
                    <span className={cn(
                      "relative inline-flex size-1.5 rounded-full",
                      statusInfo.dotColor
                    )} />
                  </span>
                  {statusInfo.label}
                </div>

                {/* ETA or arrival info */}
                {estimatedArrival ? (
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock className="size-3" />
                    <span>{estimatedArrival === "Any moment" ? t("tasks.progress.eta.anyMoment") : t("tasks.progress.eta.arrivesIn", { time: estimatedArrival })}</span>
                  </div>
                ) : taskStatus === "ASSIGNED" ? (
                  <div className="flex items-center gap-1 text-[11px] text-amber-600">
                    <Clock className="size-3" />
                    <span>{t("tasks.progress.eta.awaitingResponse")}</span>
                  </div>
                ) : taskStatus === "ARRIVED" || taskStatus === "IN_PROGRESS" ? (
                  <div className="flex items-center gap-1 text-[11px] text-green-600">
                    <MapPin className="size-3" />
                    <span>{t("tasks.progress.eta.atYourLocation")}</span>
                  </div>
                ) : taskStatus === "COMPLETED" || taskStatus === "CLOSED" ? (
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <CircleCheck className="size-3" />
                    <span>{t("tasks.progress.eta.jobCompleted")}</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">{statusInfo.sublabel}</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (assignedTo.phone) {
                    window.location.href = `tel:${assignedTo.phone}`
                  }
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 h-9 rounded-lg",
                  "bg-blue-600 text-white",
                  "hover:bg-blue-700 shadow-sm hover:shadow-md",
                  "active:scale-[0.97] transition-all duration-150"
                )}
              >
                <Phone className="size-4" />
                <span className="text-sm font-medium">{t("tasks.progress.call")}</span>
              </button>
              <button
                onClick={() => {
                  if (assignedTo.email) {
                    window.location.href = `mailto:${assignedTo.email}`
                  }
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 h-9 rounded-lg",
                  "bg-white border border-blue-600 text-blue-600",
                  "hover:bg-blue-50",
                  "active:scale-[0.97] transition-all duration-150"
                )}
              >
                <MessageSquare className="size-4" />
                <span className="text-sm font-medium">{t("tasks.progress.message")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
