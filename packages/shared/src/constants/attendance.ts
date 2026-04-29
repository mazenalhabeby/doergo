// Attendance and geofencing constants

export const ATTENDANCE_CONSTANTS = {
  // Geofence radius limits (in meters)
  DEFAULT_GEOFENCE_RADIUS: 15,
  MIN_GEOFENCE_RADIUS: 10,
  MAX_GEOFENCE_RADIUS: 100,

  // GPS accuracy threshold (in meters)
  // Reject clock-in if GPS accuracy is worse than this
  GPS_ACCURACY_THRESHOLD: 20,

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
  AUTO_CLOCK_OUT_INTERVAL_MS: 15 * 60 * 1000,    // Run every 15 minutes (timezone-aware checks)
  MIDNIGHT_CLOCK_OUT_CRON: '0 0 * * *',          // Legacy: kept for reference
  AUTO_CLOCK_OUT_JOB_ID: 'auto-clock-out-hourly',
  MIDNIGHT_CLOCK_OUT_JOB_ID: 'auto-clock-out-midnight',
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
