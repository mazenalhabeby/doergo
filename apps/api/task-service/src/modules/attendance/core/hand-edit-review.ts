import { HOURS_CHANGED_FLAG, hoursRuleFacts, type RuleFacts, type handChangedMinutes } from '@hbcfield/shared';
import type { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';

type HandChanged = Parameters<typeof handChangedMinutes>[0] & { locationId?: string | null };

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
 * ⚠️ A clocked shift still running has no clock-out yet: its original end is filled at the close
 * (`handHoldAtClose`), or, when the OFFICE closes it, it is the moment they did — it was running until then.
 * Never "none" once it ends, or every later change of the clock-out would count as nothing.
 */
export function originalTimes(
  entry: {
    isEdited?: boolean | null;
    originalClockIn?: Date | null;
    originalClockOut?: Date | null;
    clockInAt: Date;
    clockOutAt?: Date | null;
  },
  closingNow?: Date,
): { originalClockIn: Date | null; originalClockOut: Date | null } {
  if (!entry.isEdited)
    return { originalClockIn: entry.clockInAt, originalClockOut: entry.clockOutAt ?? closingNow ?? null };
  const clocked = entry.originalClockIn != null;
  return {
    originalClockIn: entry.originalClockIn ?? null,
    originalClockOut: entry.originalClockOut ?? (clocked ? (closingNow ?? null) : null),
  };
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
  // A clocked shift's original end, now known; a typed-in day keeps none (by hand from start to end).
  const fill = entry.originalClockIn != null && entry.originalClockOut == null ? { originalClockOut: clockOutAt } : {};
  const facts = hoursRuleFacts({ ...entry, originalClockOut: entry.originalClockOut ?? clockOutAt, clockOutAt });
  if (!(await handChangeHolds(rules, entry.organizationId, facts))) return fill;
  return { ...fill, approvalStatus: 'PENDING', flagReasons: withHoursChanged(flags, true) };
}
