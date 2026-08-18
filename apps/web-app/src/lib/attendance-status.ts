import { type TimeEntry } from "@/lib/api"

/**
 * Attendance STATUS derivation — what a time entry actually is, for the status
 * cell of any attendance table.
 *
 * Replaces the old `clockInWithinGeofence ? "In Zone" : "Out of Zone"` badge,
 * which was structurally incapable of showing its second state: remote entries
 * and manually-added entries hardcode the flag to `true`, pin-less spaces treat
 * distance as 0, and `REQUIRE_GEOFENCE_FOR_CLOCK_IN` rejects an out-of-ring
 * clock-in outright — so no normal path ever writes `false`. Every row read
 * "In Zone" regardless of what happened.
 *
 * The signal an admin actually wants (does this shift need attention?) is
 * already on the entry: `status`, `approvalStatus` and `flagReasons`. This maps
 * those to one primary state chip plus the flags that explain it.
 *
 * Pure — no React, no i18n. Callers translate `labelKey` (with `fallback` as
 * the default value) and map `tone` to their own palette.
 */

export type AttendanceTone =
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "orange"
  | "purple"
  | "muted"

export interface AttendanceChip {
  /** Stable React key / test hook. */
  key: string
  tone: AttendanceTone
  /** i18n key. */
  labelKey: string
  /** English text used when the key is missing from the bundle. */
  fallback: string
}

/**
 * The row's primary state, most-urgent-first: an open session is "Active"; a
 * closed one reports where it stands in the approval workflow. `AUTO` means the
 * entry cleared every check without a human looking at it.
 */
export function deriveAttendanceState(entry: TimeEntry): AttendanceChip {
  if (entry.status === "CLOCKED_IN") {
    return {
      key: "active",
      tone: "green",
      labelKey: "technicians.attendanceTab.state.active",
      fallback: "Active",
    }
  }

  switch (entry.approvalStatus) {
    case "REJECTED":
      return {
        key: "rejected",
        tone: "red",
        labelKey: "technicians.attendanceTab.state.rejected",
        fallback: "Rejected",
      }
    case "PENDING":
      return {
        key: "pending",
        tone: "amber",
        labelKey: "technicians.attendanceTab.state.needsReview",
        fallback: "Needs review",
      }
    case "APPROVED":
      return {
        key: "approved",
        tone: "blue",
        labelKey: "technicians.attendanceTab.state.approved",
        fallback: "Approved",
      }
    default:
      // AUTO — the entry cleared every check, so no human ever looked at it.
      // Same wording as the org-wide attendance page's autoApproved badge.
      return {
        key: "auto-approved",
        tone: "green",
        labelKey: "technicians.attendanceTab.state.autoApproved",
        fallback: "Auto-approved",
      }
  }
}

/**
 * Flag chips, in a fixed severity order so a row never reshuffles its badges
 * between renders (the entry's own `flagReasons` order is insertion order and
 * varies by code path). An unknown reason still renders, using its raw code —
 * a new backend flag shows up rather than silently vanishing.
 */
const FLAG_ORDER: Array<{ reason: string; chip: Omit<AttendanceChip, "key"> }> = [
  {
    reason: "MISSED_CLOCK_OUT",
    chip: {
      tone: "red",
      labelKey: "technicians.attendanceTab.flag.missedClockOut",
      fallback: "Missed clock-out",
    },
  },
  {
    reason: "OUTSIDE_GEOFENCE_IN",
    chip: {
      tone: "amber",
      labelKey: "technicians.attendanceTab.flag.geofenceIn",
      fallback: "Clock-in outside zone",
    },
  },
  {
    reason: "OUTSIDE_GEOFENCE_OUT",
    chip: {
      tone: "amber",
      labelKey: "technicians.attendanceTab.flag.geofenceOut",
      fallback: "Clock-out outside zone",
    },
  },
  {
    reason: "LATE_ARRIVAL",
    chip: {
      tone: "amber",
      labelKey: "technicians.attendanceTab.flag.late",
      fallback: "Late",
    },
  },
  {
    reason: "EARLY_DEPARTURE",
    chip: {
      tone: "amber",
      labelKey: "technicians.attendanceTab.flag.earlyDeparture",
      fallback: "Left early",
    },
  },
  {
    reason: "OVERTIME",
    chip: {
      tone: "orange",
      labelKey: "technicians.attendanceTab.flag.overtime",
      fallback: "Overtime",
    },
  },
  {
    reason: "UNSCHEDULED_DAY",
    chip: {
      tone: "purple",
      labelKey: "technicians.attendanceTab.flag.unscheduled",
      fallback: "Unscheduled",
    },
  },
]

export function deriveAttendanceFlags(entry: TimeEntry): AttendanceChip[] {
  const reasons = entry.flagReasons ?? []
  if (reasons.length === 0) return []

  const known = FLAG_ORDER.filter((f) => reasons.includes(f.reason)).map((f) => ({
    key: f.reason,
    ...f.chip,
  }))

  const unknown = reasons
    .filter((r) => !FLAG_ORDER.some((f) => f.reason === r))
    .map((r) => ({
      key: r,
      tone: "muted" as AttendanceTone,
      labelKey: `technicians.attendanceTab.flag.${r}`,
      // Raw code, humanized: OUTSIDE_GEOFENCE_IN → "Outside geofence in".
      fallback: r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, " "),
    }))

  return [...known, ...unknown]
}
