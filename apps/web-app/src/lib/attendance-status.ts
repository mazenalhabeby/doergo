import { type TimeEntry } from "@/lib/api"
import { approvalText, approvalWord, explainLabel, labelWord, sortedLabels } from "@hbcfield/shared/client"

/**
 * Attendance STATUS and LABELS for any attendance table — read from the one
 * catalogue in packages/shared/src/attendance/labels.
 *
 * Replaces the old `clockInWithinGeofence ? "In Zone" : "Out of Zone"` badge,
 * which was structurally incapable of showing its second state (every row read
 * "In Zone"), and the three label lists that used to disagree (Attendance
 * Management in English only, this file, the phone).
 *
 * The signal an admin actually wants (does this shift need attention?) is
 * already on the entry: `status`, `approvalStatus` and `flagReasons`. This maps
 * those to one state chip plus the labels that explain it, in the reader's
 * language, each with its reason when the entry saved one (`labelFacts`).
 *
 * Pure — no React. Callers pass the reader's language and map `tone` to their palette.
 */

export type AttendanceTone = "green" | "amber" | "red" | "blue" | "orange" | "purple" | "muted"

export interface AttendanceChip {
  /** Stable React key / test hook. */
  key: string
  tone: AttendanceTone
  /** The words, in the reader's language. */
  label: string
  /** Why — only for entries made under the label rules; null shows the chip alone. */
  explanation?: string | null
}

interface LabelReader {
  locale?: string | null
  hour12?: boolean
}

const STATE_TONE: Record<ReturnType<typeof approvalWord>, AttendanceTone> = {
  active: "green",
  needsReview: "amber",
  approved: "blue",
  autoApproved: "green",
  rejected: "red",
}

const STATE_KEY: Record<ReturnType<typeof approvalWord>, string> = {
  active: "active",
  needsReview: "pending",
  approved: "approved",
  autoApproved: "auto-approved",
  rejected: "rejected",
}

/**
 * The row's primary state: an open session is "Active"; a closed one reports
 * where it stands — needs review, approved, auto-approved (cleared every check
 * without a person) or rejected.
 */
export function deriveAttendanceState(entry: TimeEntry, reader: LabelReader = {}): AttendanceChip {
  const word = approvalWord(entry)
  return { key: STATE_KEY[word], tone: STATE_TONE[word], label: approvalText(entry, reader.locale) }
}

/**
 * Label chips in the catalogue's fixed order, so a row never reshuffles; an
 * unknown code still renders, muted, under its own name — a new server label
 * shows up rather than silently vanishing.
 */
export function deriveAttendanceFlags(entry: TimeEntry, reader: LabelReader = {}): AttendanceChip[] {
  const ctx = {
    locale: reader.locale,
    hour12: reader.hour12,
    clockInAt: entry.clockInAt,
    clockOutAt: entry.clockOutAt,
    timeZone: entry.timezone ?? entry.location?.timezone ?? null,
  }
  return sortedLabels(entry.flagReasons).map((l) => ({
    key: l.code,
    tone: l.tone,
    label: labelWord(l.code, reader.locale),
    explanation: explainLabel(l.code, entry.labelFacts, ctx),
  }))
}

/** Recorded on a phone without signal and sent later — the approvals filter reads this. */
export function recordedOffline(entry: { flagReasons?: string[] | null }): boolean {
  return (entry.flagReasons ?? []).includes("RECORDED_OFFLINE")
}
