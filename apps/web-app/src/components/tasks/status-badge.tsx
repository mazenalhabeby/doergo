"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Task status type matching backend enum
export type TaskStatus =
  | "DRAFT"
  | "NEW"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELED"
  | "CLOSED"

// Status configuration with colors and labels
const statusConfig: Record<
  TaskStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    className: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  },
  NEW: {
    label: "New",
    className: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  },
  ASSIGNED: {
    label: "Assigned",
    className: "bg-purple-100 text-purple-700 hover:bg-purple-100",
  },
  IN_PROGRESS: {
    label: "In Progress",
    className: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  },
  BLOCKED: {
    label: "Blocked",
    className: "bg-red-100 text-red-700 hover:bg-red-100",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-100 text-green-700 hover:bg-green-100",
  },
  CANCELED: {
    label: "Canceled",
    className: "bg-slate-100 text-slate-500 hover:bg-slate-100",
  },
  CLOSED: {
    label: "Closed",
    className: "bg-slate-50 text-slate-400 hover:bg-slate-50",
  },
}

interface StatusBadgeProps {
  status: TaskStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.DRAFT

  return (
    <Badge
      variant="secondary"
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  )
}
