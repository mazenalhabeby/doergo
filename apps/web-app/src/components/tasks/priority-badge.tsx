"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getPriorityConfig, type TaskPriority } from "@/lib/constants"

// Re-export for backwards compatibility
export type { TaskPriority }

interface PriorityBadgeProps {
  priority: TaskPriority | string
  className?: string
  showIcon?: boolean
}

export function PriorityBadge({
  priority,
  className,
  showIcon = true,
}: PriorityBadgeProps) {
  const config = getPriorityConfig(priority)
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
