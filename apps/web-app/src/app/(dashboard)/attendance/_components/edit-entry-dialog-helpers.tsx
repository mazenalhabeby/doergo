"use client"

/** EditEntryDialog's module-level helpers, moved here unchanged so its sections can read them too. */
// Smart quick-pick reasons for editing an entry — click to fill the field
// (click again to clear); the admin can still type a custom reason. i18n keys
// fall back to English until translated.
export const REASON_PRESETS: { key: string; fallback: string }[] = [
  { key: "attendance.editEntry.reasonPresets.forgotOut", fallback: "Forgot to clock out" },
  { key: "attendance.editEntry.reasonPresets.forgotIn", fallback: "Forgot to clock in" },
  { key: "attendance.editEntry.reasonPresets.wrongTime", fallback: "Wrong time entered" },
  { key: "attendance.editEntry.reasonPresets.wrongTz", fallback: "Wrong time zone" },
  { key: "attendance.editEntry.reasonPresets.lateTraffic", fallback: "Late — traffic" },
  { key: "attendance.editEntry.reasonPresets.managerApproved", fallback: "Approved by manager" },
  { key: "attendance.editEntry.reasonPresets.deviceIssue", fallback: "Device / GPS issue" },
]
