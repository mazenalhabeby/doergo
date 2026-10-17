
/** Parts moved here unchanged from stat-card.tsx (line length pass). */
// Flag reason badge config for smart auto-approval.
export const FLAG_BADGE_CONFIG: Record<string, { label: string; className: string; labelKey?: string }> = {
  CLOCK_OUT_PROVISIONAL: {
    label: "Clock-out not confirmed",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
  },
  OVERTIME: { label: "Overtime", className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  MISSED_CLOCK_OUT: { label: "Missed Clock-Out", className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  OUTSIDE_GEOFENCE_IN: { label: "Geofence (In)", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  OUTSIDE_GEOFENCE_OUT: { label: "Geofence (Out)", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  LATE_ARRIVAL: { label: "Late Arrival", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  REMOTE_WITH_WORKSPACE: {
    label: "Remote, has a workspace",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
  },
  MISSED_BREAK: { label: "Missed rest", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  EARLY_DEPARTURE: { label: "Early Departure", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  PAST_DAILY_LIMIT: {
    label: "Past today's limit",
    className: ("bg-orange-500/10 text-orange-600 dark:text-orange-400 " + "border-orange-500/20")
  },
  UNSCHEDULED_DAY: { label: "Unscheduled", className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  FIX_MOCKED: { label: "Mock location", className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  CLOCK_SUSPECT: { label: "Phone clock changed", className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  BOUNDARY_CHANGED: { label: "Site boundary changed", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  STALE: { label: "Sent a week late", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  RECORDED_OFFLINE: { label: "Recorded offline", className: "bg-muted text-muted-foreground border-border" },
  UNANCHORED: { label: "Clock not checked", className: "bg-muted text-muted-foreground border-border" },
  // Calm and neutral: approved in advance, so it explains the entry rather than asking for a look.
  APPROVED_REMOTE: {
    label: "Remote · approved in advance",
    labelKey: "technicians.attendanceTab.flag.approvedRemote",
    className: "bg-muted text-muted-foreground border-border"
  },
  // The automatic clock — informational, the same labels as the member's attendance (lib/attendance-status).
  AUTO_CLOCK_IN: {
    label: "Automatic clock-in",
    labelKey: "technicians.attendanceTab.flag.autoClockIn",
    className: "bg-muted text-muted-foreground border-border"
  },
  AUTO_CLOCK_OUT: {
    label: "Automatic clock-out",
    labelKey: "technicians.attendanceTab.flag.autoClockOut",
    className: "bg-muted text-muted-foreground border-border"
  },
  AUTO_REST: {
    label: "Automatic rest",
    labelKey: "technicians.attendanceTab.flag.autoRest",
    className: "bg-muted text-muted-foreground border-border"
  },
}
