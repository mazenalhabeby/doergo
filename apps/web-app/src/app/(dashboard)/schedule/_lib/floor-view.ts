import { formatDuration } from "@hbcfield/shared/client"
import type { FloorPerson, FloorSpace } from "@/lib/api"

/**
 * How the live floor panel is read, and by whom.
 *
 * Two layouts, because two people want different things from the same data. A
 * dispatcher assigning work all morning wants every person visible and grouped
 * by what they are doing (Lanes). A manager checking in wants to know whether
 * anything is wrong and nothing else (Exceptions). Neither is a worse version
 * of the other, so the choice belongs to the reader rather than to us.
 */
export type FloorView = "lanes" | "exceptions"

const FLOOR_VIEW_STORAGE_KEY = "hbcfield-floor-view"

/** What a first-time reader sees, and the fallback when storage is unreadable. */
const DEFAULT_FLOOR_VIEW: FloorView = "exceptions"

export function readStoredFloorView(): FloorView {
  if (typeof window === "undefined") return DEFAULT_FLOOR_VIEW
  try {
    const stored = window.localStorage.getItem(FLOOR_VIEW_STORAGE_KEY)
    return stored === "lanes" || stored === "exceptions" ? stored : DEFAULT_FLOOR_VIEW
  } catch {
    // Private mode / storage disabled — the default still applies.
    return DEFAULT_FLOOR_VIEW
  }
}

export function storeFloorView(v: FloorView): void {
  try {
    window.localStorage.setItem(FLOOR_VIEW_STORAGE_KEY, v)
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
}

/* ==========================================================================
   Reading the panel's data. Shared by both layouts, so they can never
   disagree about who counts as here.
   ========================================================================== */

/** States that mean "was due at work today". */
const EXPECTED_STATES: FloorPerson["state"][] = ["busy", "working", "break", "expected"]
/** States that mean "is at work now". A break has already arrived. */
const PRESENT_STATES: FloorPerson["state"][] = ["busy", "working", "break"]

export const isExpected = (p: FloorPerson) => EXPECTED_STATES.includes(p.state)
export const isPresent = (p: FloorPerson) => PRESENT_STATES.includes(p.state)

export interface FloorTally {
  busy: number
  working: number
  break: number
  expected: number
  leave: number
  rest: number
  /** Everyone due at work today. The denominator, and the bar's whole width. */
  due: number
  /** Everyone actually here. */
  here: number
}

export function tally(space: FloorSpace): FloorTally {
  const c = { busy: 0, working: 0, break: 0, expected: 0, leave: 0, rest: 0 }
  for (const p of space.people) c[p.state] = (c[p.state] ?? 0) + 1
  return {
    ...c,
    due: space.people.filter(isExpected).length,
    here: space.people.filter(isPresent).length,
  }
}

/**
 * How late somebody is, and how loudly to say it.
 *
 * ⚠️ Lateness is a continuum, not a state. "Not clocked in" is not actionable;
 * "due 08:00, two and a half hours ago" is, and somebody due in ten minutes is
 * not an incident at all. The colour does the triage before a word is read.
 */
type LateTone = "soon" | "slight" | "late"

export function lateness(p: FloorPerson): { minutes: number; tone: LateTone } | null {
  if (p.state !== "expected" || p.lateMinutes == null) return null
  const m = p.lateMinutes
  return { minutes: m, tone: m >= 45 ? "late" : m >= 5 ? "slight" : "soon" }
}

/** "2h 42m" / "18m" — early or late alike. Kept here so both layouts phrase it alike. */
export function lateLabel(minutes: number): string {
  return formatDuration(Math.abs(minutes))
}

/** Sort order within a group: the most useful person first. */
const STATE_ORDER: Record<FloorPerson["state"], number> = {
  expected: 0,
  working: 1,
  busy: 2,
  break: 3,
  leave: 4,
  rest: 5,
}

export function byUsefulness(a: FloorPerson, b: FloorPerson): number {
  // The latest person first inside "not in" — they are the one to chase.
  if (a.state === "expected" && b.state === "expected") {
    return (b.lateMinutes ?? -9999) - (a.lateMinutes ?? -9999)
  }
  return STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.firstName.localeCompare(b.firstName)
}

/** Ring colour per state. One hue, one meaning, used nowhere else on the panel. */
export const STATE_RING: Record<FloorPerson["state"], string> = {
  busy: "ring-blue-500",
  working: "ring-shell-accent",
  break: "ring-shell-warn",
  expected: "ring-muted-foreground/50",
  leave: "ring-violet-500",
  rest: "ring-transparent",
}

export const LATE_RING: Record<LateTone, string> = {
  soon: "ring-muted-foreground/50",
  slight: "ring-shell-warn",
  late: "ring-shell-crit",
}

export const LATE_TEXT: Record<LateTone, string> = {
  soon: "text-muted-foreground",
  slight: "text-shell-warn",
  late: "text-shell-crit",
}
