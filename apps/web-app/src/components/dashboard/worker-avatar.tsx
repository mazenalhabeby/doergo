"use client"

import React from "react"
import { cn } from "@/lib/utils"

export type WorkerStatus = "on" | "busy" | "late" | "miss" | "off"

const STATUS_LABELS: Record<WorkerStatus, string> = {
  on: "Online",
  busy: "On Task",
  late: "Late",
  miss: "Missing",
  off: "Offline",
}

export interface WorkerAvatarProps {
  initials: string
  color: string
  status: WorkerStatus
  size?: "sm" | "md" | "lg"
  budget?: { used: number; total: number }
  className?: string
}

const STATUS_STYLES: Record<WorkerStatus, { color: string; glow: string; ring: string }> = {
  on: {
    color: "#10b981",
    glow: "0 0 12px rgba(16,185,129,0.4), 0 0 4px rgba(16,185,129,0.2)",
    ring: "0 0 0 1.5px rgba(16,185,129,0.15)",
  },
  busy: {
    color: "#3b82f6",
    glow: "0 0 12px rgba(59,130,246,0.4), 0 0 4px rgba(59,130,246,0.2)",
    ring: "0 0 0 1.5px rgba(59,130,246,0.15)",
  },
  late: {
    color: "#f59e0b",
    glow: "0 0 14px rgba(245,158,11,0.5), 0 0 4px rgba(245,158,11,0.3)",
    ring: "0 0 0 1.5px rgba(245,158,11,0.2)",
  },
  miss: {
    color: "#ef4444",
    glow: "0 0 12px rgba(239,68,68,0.4), 0 0 4px rgba(239,68,68,0.2)",
    ring: "0 0 0 1.5px rgba(239,68,68,0.15)",
  },
  off: {
    color: "#64748b",
    glow: "none",
    ring: "0 0 0 1.5px rgba(100,116,139,0.1)",
  },
}

export const WorkerAvatar = React.memo(function WorkerAvatar({
  initials,
  color,
  status,
  budget,
  className,
}: WorkerAvatarProps) {
  const st = STATUS_STYLES[status]

  // Budget arc calculation
  const budgetArc = budget && budget.total > 0 ? (() => {
    const pct = Math.min(budget.used / budget.total, 1.2)
    const circumference = 132
    const offset = circumference * (1 - Math.min(pct, 1))
    const arcColor = pct >= 0.9 ? "#f59e0b" : pct >= 1 ? "#ef4444" : "#8b5cf6"
    return { circumference, offset, arcColor, pct }
  })() : null

  const label = STATUS_LABELS[status]

  return (
    <div className={cn("relative inline-flex shrink-0 group", className)} title={label}>
      {/* Budget arc ring */}
      {budgetArc && (
        <svg
          className="absolute -inset-[4px] -rotate-90 pointer-events-none"
          viewBox="0 0 48 48"
        >
          <circle
            cx="24" cy="24" r="21"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="2.5"
          />
          <circle
            cx="24" cy="24" r="21"
            fill="none"
            stroke={budgetArc.arcColor}
            strokeWidth="2.5"
            strokeDasharray={budgetArc.circumference}
            strokeDashoffset={budgetArc.offset}
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* Avatar circle with glow status */}
      <div
        className={cn(
          "w-[5cqw] h-[5cqw] min-w-[36px] min-h-[36px]",
          "rounded-full flex items-center justify-center",
          "font-bold text-white select-none",
          "text-[clamp(10px,1.6cqw,18px)]",
          "transition-all duration-300",
          status === "late" && "animate-pulse",
        )}
        style={{
          background: color,
          boxShadow: `${st.ring}, ${st.glow}`,
        }}
      >
        {initials}
      </div>

      {/* Small status dot (bottom-right) */}
      {status !== "off" && (
        <div
          className="absolute bottom-0 right-0 w-[0.9cqw] h-[0.9cqw] min-w-[8px] min-h-[8px] rounded-full border-2 border-[hsl(var(--card))]"
          style={{ backgroundColor: st.color, boxShadow: `0 0 6px ${st.color}` }}
        />
      )}

      {/* Hover tooltip */}
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-200 pointer-events-none z-20">
        <div
          className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white whitespace-nowrap backdrop-blur-sm border border-white/10"
          style={{ backgroundColor: `${st.color}dd`, boxShadow: `0 4px 12px ${st.color}40` }}
        >
          {label}
        </div>
        {/* Arrow */}
        <div
          className="w-2 h-2 rotate-45 mx-auto -mt-1"
          style={{ backgroundColor: `${st.color}dd` }}
        />
      </div>
    </div>
  )
})
