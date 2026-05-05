"use client"

import React from "react"
import { cn } from "@/lib/utils"

export type WorkerStatus = "on" | "busy" | "late" | "miss" | "off"

export interface WorkerAvatarProps {
  initials: string
  color: string
  status: WorkerStatus
  size?: "sm" | "md" | "lg"
  budget?: { used: number; total: number }
  className?: string
}

const STATUS_COLORS: Record<WorkerStatus, string> = {
  on: "#10b981",
  busy: "#3b82f6",
  late: "#f59e0b",
  miss: "#ef4444",
  off: "hsl(var(--muted-foreground))",
}

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
} as const

const SIZE_PX = { sm: 32, md: 40, lg: 48 } as const

export const WorkerAvatar = React.memo(function WorkerAvatar({
  initials,
  color,
  status,
  size = "md",
  budget,
  className,
}: WorkerAvatarProps) {
  const statusColor = STATUS_COLORS[status]
  const px = SIZE_PX[size]
  const ringOffset = 2.5
  const ringWidth = 2

  // Budget arc SVG
  const budgetArc = budget && budget.total > 0 ? (() => {
    const pct = Math.min(budget.used / budget.total, 1)
    const svgSize = px + 14
    const r = (svgSize - 4) / 2
    const circumference = 2 * Math.PI * r
    const offset = circumference * (1 - pct)
    return { svgSize, r, circumference, offset, pct }
  })() : null

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      {/* Budget arc ring (if present) */}
      {budgetArc && (
        <svg
          className="absolute -inset-[7px] -rotate-90"
          width={budgetArc.svgSize}
          height={budgetArc.svgSize}
          viewBox={`0 0 ${budgetArc.svgSize} ${budgetArc.svgSize}`}
        >
          {/* Background track */}
          <circle
            cx={budgetArc.svgSize / 2}
            cy={budgetArc.svgSize / 2}
            r={budgetArc.r}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={2}
          />
          {/* Progress arc */}
          <circle
            cx={budgetArc.svgSize / 2}
            cy={budgetArc.svgSize / 2}
            r={budgetArc.r}
            fill="none"
            stroke={budgetArc.pct >= 0.9 ? "#ef4444" : budgetArc.pct >= 0.7 ? "#f59e0b" : "#8b5cf6"}
            strokeWidth={2}
            strokeDasharray={budgetArc.circumference}
            strokeDashoffset={budgetArc.offset}
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* Avatar circle with status ring via box-shadow */}
      <div
        className={cn(
          SIZE_CLASSES[size],
          "relative rounded-full flex items-center justify-center font-semibold text-white select-none",
          status === "late" && "animate-pulse",
        )}
        style={{
          background: color,
          boxShadow: `0 0 0 ${ringOffset}px hsl(var(--card)), 0 0 0 ${ringOffset + ringWidth}px ${statusColor}`,
        }}
      >
        {initials}
      </div>
    </div>
  )
})
