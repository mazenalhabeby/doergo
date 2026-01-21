"use client"

import { cn } from "@/lib/utils"
import { getStatusConfig, type TaskStatus } from "@/lib/constants"

// Re-export for backwards compatibility
export type { TaskStatus }

interface StatusBadgeProps {
  status: TaskStatus | string
  className?: string
  showDot?: boolean
}

export function StatusBadge({ status, className, showDot = true }: StatusBadgeProps) {
  const config = getStatusConfig(status)

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
        className
      )}
      style={{
        backgroundColor: `${config.hex}15`,
        color: config.hex,
        boxShadow: `0 1px 2px ${config.hex}10`,
      }}
    >
      {showDot && (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: config.hex }}
        />
      )}
      {config.label}
    </div>
  )
}
