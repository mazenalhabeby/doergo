"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ArrowDown, ArrowUp, Minus, AlertTriangle } from "lucide-react"

// Task priority type matching backend enum
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

// Priority configuration with colors, labels, and icons
const priorityConfig: Record<
  TaskPriority,
  { label: string; className: string; icon: React.ElementType }
> = {
  LOW: {
    label: "Low",
    className: "bg-slate-100 text-slate-500 hover:bg-slate-100",
    icon: ArrowDown,
  },
  MEDIUM: {
    label: "Medium",
    className: "bg-blue-100 text-blue-600 hover:bg-blue-100",
    icon: Minus,
  },
  HIGH: {
    label: "High",
    className: "bg-orange-100 text-orange-600 hover:bg-orange-100",
    icon: ArrowUp,
  },
  URGENT: {
    label: "Urgent",
    className: "bg-red-100 text-red-600 hover:bg-red-100",
    icon: AlertTriangle,
  },
}

interface PriorityBadgeProps {
  priority: TaskPriority
  className?: string
  showIcon?: boolean
}

export function PriorityBadge({
  priority,
  className,
  showIcon = true,
}: PriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig.MEDIUM
  const Icon = config.icon

  return (
    <Badge
      variant="secondary"
      className={cn("gap-1", config.className, className)}
    >
      {showIcon && <Icon className="size-3" />}
      {config.label}
    </Badge>
  )
}
