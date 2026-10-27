import { HOURS_CHANGED_FLAG, hoursRuleFacts, type RuleFacts, type handChangedMinutes } from '@hbcfield/shared';
import type { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';

type HandChanged = Parameters<typeof handChangedMinutes>[0] & {
  locationId?: string | null;
  clockOutProvisional?: boolean | null;
};

/** What the office writes when a change by hand is held: waiting, nobody's approval yet. */
export const BACK_TO_PENDING = {
  approvalStatus: 'PENDING',
  approvedById: null,
  approvedAt: null,
  approvalNotes: null,
} as const;

/**
 * Is a change by hand past an office rule? Then the entry carries `HOURS_CHANGED` — a review label, so every
 * later re-labelling (overtime approved, a rest added, the day's hours set) keeps it waiting instead of working
 * its status out again as automatic. A change back under the rule drops the label.
 */
export async function handChangeHolds(rules: ApprovalRulesService, organizationId: string, facts: RuleFacts) {
  return (facts.minutes ?? 0) > 0 && (await rules.needsMoreFor(organizationId, 'hours', [facts]))[0] === true;
}

/** The entry's labels with `HOURS_CHANGED` added or removed. */
export function withHoursChanged(flags: readonly string[], holds: boolean): string[] {
  const rest = flags.filter((f) => f !== HOURS_CHANGED_FLAG);
  return holds ? [...rest, HOURS_CHANGED_FLAG] : rest;
}

/**
 * What the times were before ANY hand change — the baseline a hand change is measured from, kept on the first edit.
 * ⚠️ A day TYPED IN by the office keeps no original clock-in (null): it is by hand from start to end, and stays so.
 * ⚠️ A clocked shift still running has no clock-out yet. Its original end is the real clock-out (filled at the close,
 * `handHoldAtClose`, or on its next edit for shifts closed before that was kept); when the OFFICE closes a shift
 * somebody forgot, it is where it should have ended — the planned end, else the last moment they were seen
 * (`closingAt`): never the moment the office got round to it, or a fix the next morning counts as 15 h by hand.
 */
export function originalTimes(
  entry: {
    isEdited?: boolean | null;
    originalClockIn?: Date | null;
    originalClockOut?: Date | null;
    clockInAt: Date;
    clockOutAt?: Date | null;
    editedAt?: Date | null;
    expectedClockOutAt?: Date | null;
  },
  closingAt?: Date,
): { originalClockIn: Date | null; originalClockOut: Date | null } {
  if (!entry.isEdited)
    return { originalClockIn: entry.clockInAt, originalClockOut: entry.clockOutAt ?? closingAt ?? null };
  const clocked = entry.originalClockIn != null;
  // An older row (edited while running, closed before the end was kept): a clock-out written AFTER it ended may be
  // a hand change itself — the planned end is the safer baseline then.
  const handMadeOut = !!(entry.clockOutAt && entry.editedAt && entry.editedAt > entry.clockOutAt);
  const closedAt = handMadeOut ? (entry.expectedClockOutAt ?? entry.clockOutAt) : entry.clockOutAt;
  return {
    originalClockIn: entry.originalClockIn ?? null,
    originalClockOut: entry.originalClockOut ?? (clocked ? (closedAt ?? closingAt ?? null) : null),
  };
}

/**
 * Where a forgotten shift the office closes ended at the LATEST: the earliest of its planned end, the last moment
 * the person was seen, and now — so a shift closed at 10:00 "at its planned 17:00" counts the 7 h it never worked,
 * and a phone silent since 12:00 does not stretch to the planned end.
 */
export function forgottenEnd(entry: { expectedClockOutAt?: Date | null; lastSeenAt?: Date | null }, now: Date): Date {
  const known = [entry.expectedClockOutAt, entry.lastSeenAt, now].filter((d): d is Date => d instanceof Date);
  return new Date(Math.min(...known.map((d) => d.getTime())));
}

/**
 * What a close writes for a shift changed BY HAND while it was running: its original end is now known (the real
 * clock-out), and past an office rule on changed hours it waits, labelled. Untouched shifts: nothing, no query.
 */
export async function handHoldAtClose(
  rules: ApprovalRulesService,
  entry: HandChanged & { organizationId: string },
  clockOutAt: Date,
  flags: readonly string[],
): Promise<{ approvalStatus?: 'PENDING'; flagReasons?: string[]; originalClockOut?: Date }> {
  if (!entry.isEdited) return {};
  // A clocked shift's original end, now known — never a provisional guess (the real clock-out replaces it and
  // fills it then); a typed-in day keeps none (by hand from start to end).
  const known = entry.originalClockIn != null && entry.originalClockOut == null && !entry.clockOutProvisional;
  const fill = known ? { originalClockOut: clockOutAt } : {};
  const facts = hoursRuleFacts({ ...entry, originalClockOut: entry.originalClockOut ?? clockOutAt, clockOutAt });
  if (!(await handChangeHolds(rules, entry.organizationId, facts))) return fill;
  return { ...fill, approvalStatus: 'PENDING', flagReasons: withHoursChanged(flags, true) };
}
