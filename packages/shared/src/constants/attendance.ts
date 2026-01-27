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
  REQUIRE_GEOFENCE_FOR_CLOCK_IN: true,  // Must be within geofence to clock in
  ALLOW_CLOCK_OUT_ANYWHERE: true,       // Allow clock-out from anywhere
  ALERT_ON_GEOFENCE_VIOLATION: true,    // Send alerts when clock-out is outside geofence

  // Scheduler settings
  AUTO_CLOCK_OUT_INTERVAL_MS: 60 * 60 * 1000,    // Run every hour (3600000ms)
  MIDNIGHT_CLOCK_OUT_CRON: '0 0 * * *',          // Run at midnight daily (00:00)
  AUTO_CLOCK_OUT_JOB_ID: 'auto-clock-out-hourly',
  MIDNIGHT_CLOCK_OUT_JOB_ID: 'auto-clock-out-midnight',
} as const;
