// Attendance and geofencing constants

export const ATTENDANCE_CONSTANTS = {
  // Geofence radius limits (in meters). Default 50m balances phone-GPS scatter
  // (~5–30m) against false clock-ins — small enough to be the site, large
  // enough not to reject someone standing at the building.
  DEFAULT_GEOFENCE_RADIUS: 50,
  MIN_GEOFENCE_RADIUS: 10,
  /*
    Raised from 100m. A circle is measured from the geocoded address, which is
    the front door, so a site with a yard or several buildings could not be
    expressed at ALL at 100m: widen it and the neighbour is inside, narrow it
    and your own warehouse is out. Guidance for outdoor sites is 100-200m, and
    a campus needs more than that. Sites that need a shape rather than a circle
    now draw a boundary instead — see `geofencePolygon`.
  */
  MAX_GEOFENCE_RADIUS: 500,

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
  // REQUIRE_GEOFENCE_FOR_CLOCK_IN was here: one switch for the entire product,
  // where a yard and a client-facing sales team had to want the same answer.
  // Replaced by a per-workspace ceiling and a per-member grant — see
  // packages/shared/src/attendance/away-policy.ts. Removed rather than
  // deprecated: a constant nothing reads is a setting somebody will one day
  // change and wonder why nothing happened.
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

  // No-show materialization: rolling upsert of expected shifts. Slow cadence
  // (bounded scan over the rota); the actual no-show sweep rides the 1-min tick.
  SHIFT_MATERIALIZE_INTERVAL_MS: 30 * 60 * 1000,  // Every 30 minutes
  SHIFT_MATERIALIZE_JOB_ID: 'shift-materialize',
  SHIFT_MATERIALIZE_WINDOW_HOURS: 36,

  // Geofence excursion ("out of ring") sweep: flags APPROVED excursions whose
  // grace timer has lapsed so the approver sees it even if the phone stopped
  // heart-beating. It NEVER clocks anyone out (no GPS server-side). 1-min cadence.
  GEOFENCE_EXCURSION_SWEEP_INTERVAL_MS: 60 * 1000,
  GEOFENCE_EXCURSION_SWEEP_JOB_ID: 'geofence-excursion-sweep',
} as const;

// Geofence excursion workflow. When a clocked-in worker leaves their space's
// ring, they submit a reason + how long they'll be out; a responsible person
// approves (adjustable time) or rejects. Only a REJECT clocks the worker out.
export const GEOFENCE_EXCURSION = {
  // Duration presets offered to the employee (minutes) + a custom option.
  DURATION_PRESETS: [15, 30, 60, 120] as number[],
  CUSTOM_MAX_MINUTES: 480, // 8h ceiling on a custom request
  // Hysteresis buffer (meters) added to the ring for the "left" test only, so GPS
  // noise near the edge doesn't rapidly toggle OUT/RETURNED. Treat as OUT when
  // distance > radius + buffer; treat as back IN when distance <= radius.
  RING_HYSTERESIS_M: 15,
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

/*
  A shift left open is closed with a TEMPORARY time — never silently for good.

  Nothing used to close a forgotten shift, and with one open shift per member a
  forgotten clock-out blocked the next day's clock-in. The sweep closes it with
  the best evidence and marks it provisional; the member's real clock-out (sent
  late from a phone without signal) or their answer to "when did you leave?"
  replaces it. The temporary time never counts past the shift end.
*/
export const OPEN_SHIFT_CLOSE = {
  AFTER_SHIFT_END_HOURS: 12,     // A planned shift, this long after its end
  UNPLANNED_AFTER_HOURS: 24,     // A shift with no planned end, this long after clock-in
  UNPLANNED_FALLBACK_HOURS: 8,   // …closed at clock-in + this, with nothing better to go on
  BATCH: 100,                    // Per sweep tick — the partial indexes make each one cheap
} as const;

// Flag reasons for smart auto-approval
export const ATTENDANCE_FLAG_REASONS = {
  OVERTIME: 'OVERTIME',
  MISSED_CLOCK_OUT: 'MISSED_CLOCK_OUT',
  // Closed by the open-shift sweep with a temporary time; waiting for the member's real one.
  CLOCK_OUT_PROVISIONAL: 'CLOCK_OUT_PROVISIONAL',
  OUTSIDE_GEOFENCE_IN: 'OUTSIDE_GEOFENCE_IN',
  OUTSIDE_GEOFENCE_OUT: 'OUTSIDE_GEOFENCE_OUT',
  LATE_ARRIVAL: 'LATE_ARRIVAL',
  EARLY_DEPARTURE: 'EARLY_DEPARTURE',
  UNSCHEDULED_DAY: 'UNSCHEDULED_DAY',
  // How it was recorded (see sync/occurrence.ts). The first two are informational.
  RECORDED_OFFLINE: 'RECORDED_OFFLINE',
  UNANCHORED: 'UNANCHORED',
  CLOCK_SUSPECT: 'CLOCK_SUSPECT',
  STALE: 'STALE',
  FIX_MOCKED: 'FIX_MOCKED',
  BOUNDARY_CHANGED: 'BOUNDARY_CHANGED',
} as const;

export type AttendanceFlagReason = typeof ATTENDANCE_FLAG_REASONS[keyof typeof ATTENDANCE_FLAG_REASONS];

// Human-readable labels for flag reasons
export const FLAG_REASON_LABELS: Record<string, string> = {
  OVERTIME: 'Overtime',
  MISSED_CLOCK_OUT: 'Missed Clock-Out',
  CLOCK_OUT_PROVISIONAL: 'Clock-out not confirmed',
  OUTSIDE_GEOFENCE_IN: 'Outside Geofence (In)',
  OUTSIDE_GEOFENCE_OUT: 'Outside Geofence (Out)',
  LATE_ARRIVAL: 'Late Arrival',
  EARLY_DEPARTURE: 'Early Departure',
  UNSCHEDULED_DAY: 'Unscheduled Day',
  RECORDED_OFFLINE: 'Recorded offline',
  UNANCHORED: 'Phone clock not checked',
  CLOCK_SUSPECT: 'Phone clock changed',
  STALE: 'Sent over a week late',
  FIX_MOCKED: 'Mock location',
  BOUNDARY_CHANGED: 'Site boundary changed since',
};
