// Attendance and geofencing constants

export const ATTENDANCE_CONSTANTS = {
  // Geofence radius limits (in meters). Default 50m balances phone-GPS scatter
  // (~5–30m) against false clock-ins — small enough to be the site, large
  // enough not to reject someone standing at the building.
  DEFAULT_GEOFENCE_RADIUS: 50,
  MIN_GEOFENCE_RADIUS: 10,
  MAX_GEOFENCE_RADIUS: 100,

  // GPS accuracy sanity cap (in meters). Reject a clock-in only if the fix is
  // genuinely useless (worse than this). Kept lenient because real-world fixes
  // are often 20-50m+ indoors / in cities / on desktop Wi-Fi positioning. The
  // geofence check is accuracy-aware (radius + accuracy), so borderline-but-
  // plausible fixes still pass instead of being hard-rejected.
  GPS_ACCURACY_THRESHOLD: 100,

  // Location name limits
  LOCATION_NAME_MAX_LENGTH: 100,
  LOCATION_ADDRESS_MAX_LENGTH: 500,

  // Time entry limits
  MAX_CLOCK_IN_DURATION_HOURS: 16, // Auto clock-out after 16 hours
  GRACE_PERIOD_MINUTES: 5,         // Allow 5 min early clock-in

  // Validation rules
  REQUIRE_GEOFENCE_FOR_CLOCK_IN: true,  // Block clock-in if outside geofence
  ALLOW_CLOCK_OUT_ANYWHERE: true,       // Allow clock-out from anywhere
  ALERT_ON_GEOFENCE_VIOLATION: true,    // Send alerts when clock-out is outside geofence
  AUTO_CLOCK_OUT_DISTANCE_METERS: 150,  // Auto clock-out if technician is this far from location
  HEARTBEAT_INTERVAL_MS: 5 * 60 * 1000, // Mobile sends heartbeat every 5 minutes
  SCHEDULE_GRACE_PERIOD_MINUTES: 30,    // Minutes after shift end before auto-clock-out

  // Smart auto-approval thresholds
  LATE_ARRIVAL_THRESHOLD_MINUTES: 30,     // Flag if >30 min after schedule start
  EARLY_DEPARTURE_THRESHOLD_MINUTES: 30,  // Flag if >30 min before schedule end
  OVERTIME_THRESHOLD_MINUTES: 30,         // Flag if >30 min past schedule end

  // Scheduler settings
  AUTO_CLOCK_OUT_INTERVAL_MS: 15 * 60 * 1000,    // Legacy force-close sweep (removed)
  MIDNIGHT_CLOCK_OUT_CRON: '0 0 * * *',          // Legacy: kept for reference
  AUTO_CLOCK_OUT_JOB_ID: 'auto-clock-out-hourly',
  MIDNIGHT_CLOCK_OUT_JOB_ID: 'auto-clock-out-midnight',

  // Shift reminder engine: how often the sweep runs. The sweep is a single
  // indexed query (status + nextRemindAt) returning only entries actually due,
  // so a tight cadence is cheap and gives ~1-min reminder precision.
  SHIFT_REMINDER_SWEEP_INTERVAL_MS: 60 * 1000,   // Every 1 minute
  SHIFT_REMINDER_JOB_ID: 'shift-reminder-sweep',
} as const;

// Shift reminder engine defaults (space-centric attendance).
// The engine NEVER force-closes — it nudges the worker, routes extra-time to a
// space leader, then escalates. These are the fallback cadence values used when
// a shift doesn't override them.
export const SHIFT_REMINDER_DEFAULTS = {
  GRACE_MINUTES: 5,          // Minutes after expected end before the first reminder
  REMINDER_INTERVAL_MINUTES: 5, // Gap between subsequent reminders
  MAX_REMINDERS: 3,          // Reminders before escalating to a space leader
} as const;

// Safety net for UNSCHEDULED open sessions (a clock-in with no resolved shift →
// no expected end). Without this, such a session runs forever with no reminder
// (the "71h" bug). We arm a synthetic reminder at SOFT_HOURS so it flows through
// the SAME indexed reminder sweep: nudge the worker every REMINDER_INTERVAL, then
// after MAX_REMINDERS escalate to the responsible space leader to review/approve.
// It NEVER force-closes — same philosophy as the shift engine.
export const UNSCHEDULED_SESSION_DEFAULTS = {
  SOFT_HOURS: 8,               // Hours open (no shift) before the first nudge
  REMINDER_INTERVAL_MINUTES: 60, // Then remind hourly (not the 5-min shift cadence)
  MAX_REMINDERS: 3,            // Nudges before escalating to the responsible leader (~11h)
} as const;

// Flag reasons for smart auto-approval
export const ATTENDANCE_FLAG_REASONS = {
  OVERTIME: 'OVERTIME',
  MISSED_CLOCK_OUT: 'MISSED_CLOCK_OUT',
  OUTSIDE_GEOFENCE_IN: 'OUTSIDE_GEOFENCE_IN',
  OUTSIDE_GEOFENCE_OUT: 'OUTSIDE_GEOFENCE_OUT',
  LATE_ARRIVAL: 'LATE_ARRIVAL',
  EARLY_DEPARTURE: 'EARLY_DEPARTURE',
  UNSCHEDULED_DAY: 'UNSCHEDULED_DAY',
} as const;

export type AttendanceFlagReason = typeof ATTENDANCE_FLAG_REASONS[keyof typeof ATTENDANCE_FLAG_REASONS];

// Human-readable labels for flag reasons
export const FLAG_REASON_LABELS: Record<string, string> = {
  OVERTIME: 'Overtime',
  MISSED_CLOCK_OUT: 'Missed Clock-Out',
  OUTSIDE_GEOFENCE_IN: 'Outside Geofence (In)',
  OUTSIDE_GEOFENCE_OUT: 'Outside Geofence (Out)',
  LATE_ARRIVAL: 'Late Arrival',
  EARLY_DEPARTURE: 'Early Departure',
  UNSCHEDULED_DAY: 'Unscheduled Day',
};
