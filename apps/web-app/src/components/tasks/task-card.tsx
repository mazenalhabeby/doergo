"use client"

import Link from "next/link"
import { Clock, MapPin, User, ArrowRight, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { cn, getRequestId, formatTimeAgo } from "@/lib/utils"
import { getPriorityConfig } from "@/lib/constants"
import { StatusBadge } from "./status-badge"
import type { Task } from "@/lib/api"

interface TaskCardProps {
  task: Task
  showActions?: boolean
  showAssignButton?: boolean
  onAssign?: (taskId: string) => void
  className?: string
}

export function TaskCard({
  task,
  showActions = true,
  showAssignButton = true,
  onAssign,
  className,
}: TaskCardProps) {
  const priorityConfig = getPriorityConfig(task.priority)
  const taskRequestId = getRequestId(task)
  const isHigh = task.priority === "HIGH"
  const isUrgent = task.priority === "URGENT"
  const PriorityIcon = priorityConfig.icon

  return (
    <div
      className={cn(
        "relative bg-white rounded-2xl border border-slate-200/60 overflow-hidden",
        "shadow-sm transition-all duration-300 ease-out",
        className
      )}
    >
      {/* Priority accent bar */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          isUrgent
            ? "bg-gradient-to-b from-red-500 to-red-600"
            : isHigh
            ? "bg-gradient-to-b from-amber-500 to-amber-600"
            : "bg-gradient-to-b from-slate-200 to-slate-300"
        )}
      />

      <div className="p-6 pl-7">
        {/* Top Row: Status + Request ID + Priority + Time */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Status Badge */}
            <StatusBadge status={task.status} />

            {/* Request ID */}
            <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded-md">
              {taskRequestId}
            </span>

            {/* Priority Tag */}
            {(isUrgent || isHigh) && (
              <div
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold",
                  isUrgent
                    ? "bg-red-50 text-red-600 ring-1 ring-red-100"
                    : "bg-amber-50 text-amber-600 ring-1 ring-amber-100"
                )}
              >
                <PriorityIcon className="size-3" />
                {priorityConfig.label}
              </div>
            )}
          </div>

          {/* Time */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="size-3.5" />
            {formatTimeAgo(task.updatedAt)}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            {/* Title */}
            <HoverCard openDelay={300} closeDelay={100}>
              <HoverCardTrigger asChild>
                <h3 className="text-base font-semibold text-slate-800 mb-2 truncate cursor-default">
                  {task.title}
                </h3>
              </HoverCardTrigger>
              {task.title.length > 50 && (
                <HoverCardContent
                  side="top"
                  align="start"
                  className="w-80 p-3 text-sm font-semibold text-slate-800"
                >
                  {task.title}
                </HoverCardContent>
              )}
            </HoverCard>

            {/* Description */}
            {task.description && (
              <HoverCard openDelay={300} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <p className="text-sm text-slate-500 leading-relaxed line-clamp-2 mb-4 cursor-default">
                    {task.description}
                  </p>
                </HoverCardTrigger>
                {task.description.length > 100 && (
                  <HoverCardContent
                    side="bottom"
                    align="start"
                    className="w-96 p-3 text-sm text-slate-600 leading-relaxed"
                  >
                    {task.description}
                  </HoverCardContent>
                )}
              </HoverCard>
            )}

            {/* Meta Row */}
            <div className="flex items-center gap-4 flex-wrap">
              {task.assignedTo && (
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                    <span className="text-[10px] font-semibold text-white">
                      {task.assignedTo.firstName?.[0]}{task.assignedTo.lastName?.[0]}
                    </span>
                  </div>
                  <span className="text-sm text-slate-600">
                    {task.assignedTo.firstName} {task.assignedTo.lastName}
                  </span>
                  {/* Acceptance Status Indicator */}
                  {task.status === "ASSIGNED" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 ring-1 ring-amber-200/50">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
                      </span>
                      Awaiting acceptance
                    </span>
                  )}
                  {task.status === "ACCEPTED" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-600 ring-1 ring-green-200/50">
                      <CheckCircle2 className="size-3" />
                      Confirmed
                    </span>
                  )}
                </div>
              )}
              {task.locationAddress && (
                <HoverCard openDelay={300} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 cursor-default">
                      <MapPin className="size-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate max-w-[180px]">
                        {task.locationAddress}
                      </span>
                    </div>
                  </HoverCardTrigger>
                  {task.locationAddress.length > 25 && (
                    <HoverCardContent
                      side="top"
                      align="start"
                      className="w-72 p-3 text-sm text-slate-600"
                    >
                      <div className="flex items-start gap-2">
                        <MapPin className="size-4 text-slate-400 flex-shrink-0 mt-0.5" />
                        <span>{task.locationAddress}</span>
                      </div>
                    </HoverCardContent>
                  )}
                </HoverCard>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {showActions && (
            <div className="flex-shrink-0 self-center flex flex-col gap-2 w-[140px]">
              {/* View Details Button */}
              <Link href={`/tasks/${task.id}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-full h-10 rounded-xl font-medium justify-center",
                    "border-slate-200 bg-white text-slate-600",
                    "hover:bg-blue-600 hover:text-white hover:border-blue-600",
                    "hover:shadow-lg hover:shadow-blue-600/25",
                    "transition-all duration-300"
                  )}
                >
                  View Details
                  <ArrowRight className="size-4 ml-1.5" />
                </Button>
              </Link>

              {/* Assign Button - only show if not assigned */}
              {showAssignButton && !task.assignedTo && (
                onAssign ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAssign(task.id)}
                    className={cn(
                      "w-full h-10 rounded-xl font-medium justify-center",
                      "border-amber-200 bg-amber-50 text-amber-700",
                      "hover:bg-amber-100 hover:border-amber-300",
                      "transition-all duration-200"
                    )}
                  >
                    <User className="size-4 mr-1.5" />
                    Assign
                  </Button>
                ) : (
                  <Link href={`/tasks/${task.id}?assign=true`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-full h-10 rounded-xl font-medium justify-center",
                        "border-amber-200 bg-amber-50 text-amber-700",
                        "hover:bg-amber-100 hover:border-amber-300",
                        "transition-all duration-200"
                      )}
                    >
                      <User className="size-4 mr-1.5" />
                      Assign
                    </Button>
                  </Link>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
