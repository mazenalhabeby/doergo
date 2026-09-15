import { type TimeEntry } from "@/lib/api"

/**
 * What adding N minutes of overtime to a closed shift will do — the numbers the
 * dialog shows before anyone agrees to it.
 *
 * Overtime runs from the shift END, never from the moment it is approved, and
 * never counts past the clock-out: that is the server's rule
 * (`overtimeEndFor` + counted time), repeated here only to preview it.
 */
export interface OvertimePreview {
  /** Minutes the member stayed past the shift end (0 when they left on time). */
  pastEnd: number
  /** Sensible starting value: the time they actually stayed. */
  suggested: number
  /** When counted time will end. */
  countedUntil: Date
  /** Counted minutes now, and after. Null when the entry carries none. */
  countedBefore: number | null
  countedAfter: number | null
}

const MINUTE = 60_000

export function canAddOvertime(entry: TimeEntry): boolean {
  return entry.status === "CLOCKED_OUT" && !!entry.clockOutAt && !!entry.expectedClockOutAt
}

/** Who is looking, as far as offering "Add overtime" is concerned. */
export interface OvertimeViewer {
  userId: string | null | undefined
  /** `canApproveOvertime` — the approval permission. */
  canApprove: boolean
  /** `shift_scheduling` — the Option the route is sold under (it 402s without). */
  hasOption: boolean
}

/**
 * May this viewer be offered "Add overtime" at all, before looking at a row?
 *
 * The permission and the Option together, exactly as the route asks. Written
 * once because the attendance board and a member's own attendance tab both
 * offer the action — two copies of a gate is how one screen starts showing a
 * button the other hides and the server refuses.
 */
export function overtimeActionEnabled(viewer: OvertimeViewer): boolean {
  return viewer.canApprove && viewer.hasOption
}

/**
 * May THIS row carry the action?
 *
 * ⚠️ Never on the viewer's own shift. Approving your own hours is refused by
 * the server; offering the button anyway turns a rule into an error toast, and
 * a manager looking down the board at their own row would read it as a bug.
 */
export function mayOfferOvertime(entry: TimeEntry, viewer: OvertimeViewer): boolean {
  if (!overtimeActionEnabled(viewer) || !canAddOvertime(entry)) return false
  const owner = entry.userId ?? entry.user?.id
  return !(viewer.userId && owner && owner === viewer.userId)
}

export function overtimePreview(entry: TimeEntry, minutes: number): OvertimePreview | null {
  if (!canAddOvertime(entry)) return null
  const out = Date.parse(entry.clockOutAt as string)
  const end = Date.parse(entry.expectedClockOutAt as string)
  const pastEnd = Math.max(0, Math.round((out - end) / MINUTE))
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0

  const endBefore = Math.min(out, end)
  const endAfter = Math.min(out, end + safe * MINUTE)
  const counted = entry.paidMinutes ?? null
  return {
    pastEnd,
    suggested: pastEnd > 0 ? pastEnd : 30,
    countedUntil: new Date(endAfter),
    countedBefore: counted,
    countedAfter: counted == null ? null : counted + Math.round((endAfter - endBefore) / MINUTE),
  }
}
