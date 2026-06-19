import React from "react"
import { format, parseISO } from "date-fns"
import { cn } from "@/lib/utils"

// Flag reason badge config for smart auto-approval.
const FLAG_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  OVERTIME: { label: "Overtime", className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  MISSED_CLOCK_OUT: { label: "Missed Clock-Out", className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  OUTSIDE_GEOFENCE_IN: { label: "Geofence (In)", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  OUTSIDE_GEOFENCE_OUT: { label: "Geofence (Out)", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  LATE_ARRIVAL: { label: "Late Arrival", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  EARLY_DEPARTURE: { label: "Early Departure", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  UNSCHEDULED_DAY: { label: "Unscheduled", className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
}

export function FlagReasonBadges({ reasons }: { reasons?: string[] }) {
  if (!reasons || reasons.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((reason) => {
        const config = FLAG_BADGE_CONFIG[reason] || { label: reason, className: "bg-muted text-muted-foreground border-border" }
        return (
          <span
            key={reason}
            className={cn(
              "inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border",
              config.className,
            )}
          >
            {config.label}
          </span>
        )
      })}
    </div>
  )
}

/** Parse a date input (handles both Date objects and ISO strings). */
export function toDate(dateInput: Date | string): Date {
  return dateInput instanceof Date ? dateInput : parseISO(dateInput)
}

/** Format a time as "h:mm a", or "-" when null. */
export function formatTime(dateInput: Date | string | null): string {
  if (!dateInput) return "-"
  return format(toDate(dateInput), "h:mm a")
}

/** Stat card used across the attendance tabs. */
export function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  color: "blue" | "green" | "amber" | "slate"
}) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    slate: "bg-muted text-muted-foreground",
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-4">
        <div className={cn("p-3 rounded-xl", colorClasses[color])}>
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        </div>
      </div>
    </div>
  )
}
