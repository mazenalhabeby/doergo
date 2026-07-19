"use client"

import React from "react"
import { Lock, Moon } from "lucide-react"
import { cn } from "@/lib/utils"

export type WorkerStatus = "on" | "busy" | "away" | "off"

// Availability-aligned labels (the status a user sets: Available/Busy/Away).
// "off" = offline (app not active).
const STATUS_LABELS: Record<WorkerStatus, string> = {
  on: "Available",
  busy: "Busy",
  away: "Away",
  off: "Offline",
}

export interface WorkerAvatarProps {
  initials: string
  color: string
  /** Availability (Available/Busy/Away) or Offline — shown as the corner dot. */
  status: WorkerStatus
  size?: "sm" | "md" | "lg"
  imageUrl?: string
  hideDot?: boolean
  className?: string
  /** On the clock right now — shows a green ring around the avatar. */
  clockedIn?: boolean
}

const STATUS_STYLES: Record<WorkerStatus, { color: string }> = {
  on: { color: "#10b981" },   // Available — green
  busy: { color: "#ef4444" }, // Busy — red (with lock icon)
  away: { color: "#f59e0b" }, // Away — amber (with moon icon)
  off: { color: "#94a3b8" },  // Offline — grey
}

export const WorkerAvatar = React.memo(function WorkerAvatar({
  initials,
  color,
  status,
  imageUrl,
  hideDot,
  className,
  clockedIn,
}: WorkerAvatarProps) {
  const st = STATUS_STYLES[status]
  const label = STATUS_LABELS[status]

  return (
    <div className={cn("relative inline-flex shrink-0 group", className)}>
      {/* Avatar circle */}
      <div
        className={cn(
          "w-11 h-11", // fixed 44px — no cqw so it never scales with the screen
          "rounded-full flex items-center justify-center",
          "font-bold text-white select-none",
          "text-[15px]",
          "transition-all duration-300",
          "overflow-hidden",
          // Green ring = clocked in (on shift right now). Distinct from the
          // bottom-right availability dot.
          clockedIn && "ring-2 ring-green-500 ring-offset-1 ring-offset-[hsl(var(--card))]",
        )}
        style={{ background: color }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={initials} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>

      {/* Availability dot (bottom-right): green Available, red Busy (lock),
          amber Away (moon), grey Offline. */}
      {!hideDot && (
        <div
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-[hsl(var(--card))]"
          style={{
            backgroundColor: st.color,
            boxShadow: status === "off" ? "none" : `0 0 6px ${st.color}80`,
            width: status === "busy" || status === "away" ? 16 : 11,
            height: status === "busy" || status === "away" ? 16 : 11,
          }}
        >
          {status === "busy" && <Lock className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
          {status === "away" && <Moon className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />}
        </div>
      )}

      {/* Hover tooltip */}
      {!hideDot && <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-200 pointer-events-none z-20">
        <div
          className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white whitespace-nowrap backdrop-blur-sm border border-white/10"
          style={{ backgroundColor: `${st.color}dd`, boxShadow: `0 4px 12px ${st.color}40` }}
        >
          {clockedIn ? `${label} · Clocked in` : label}
        </div>
        {/* Arrow */}
        <div
          className="w-2 h-2 rotate-45 mx-auto -mt-1"
          style={{ backgroundColor: `${st.color}dd` }}
        />
      </div>}
    </div>
  )
})
