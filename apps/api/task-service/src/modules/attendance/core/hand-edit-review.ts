import { HOURS_CHANGED_FLAG, hoursRuleFacts, type RuleFacts, type handChangedMinutes } from '@hbcfield/shared';
import type { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';

type HandChanged = Parameters<typeof handChangedMinutes>[0] & { locationId?: string | null };

export { hoursRuleFacts };

/**
 * Is a change by hand past an office rule? Then the entry carries `HOURS_CHANGED` — a review label, so every
 * later re-labelling (overtime approved, a rest added, the day's hours set) keeps it waiting instead of working
 * its status out again as automatic. A change back under the rule drops the label.
 */
export async function handChangeHolds(rules: ApprovalRulesService, organizationId: string, facts: RuleFacts) {
  return (facts.minutes ?? 0) > 0 && !!(await rules.secondStepFor(organizationId, 'hours', facts));
}

/** The entry's labels with `HOURS_CHANGED` added or removed. */
export function withHoursChanged(flags: readonly string[], holds: boolean): string[] {
  const rest = flags.filter((f) => f !== HOURS_CHANGED_FLAG);
  return holds ? [...rest, HOURS_CHANGED_FLAG] : rest;
}

/**
 * Does a shift the office changed BY HAND while it was running have to wait for approval when it closes? Yes
 * when the whole change from what was clocked is past an office rule on changed hours — an edit with no clock-out
 * cannot be judged in full yet (entry-edit.service.ts). Untouched shifts ask nothing (no query).
 */
export async function handEditNeedsReview(
  rules: ApprovalRulesService,
  entry: HandChanged & { organizationId: string },
  clockOutAt: Date,
): Promise<boolean> {
  if (!entry.isEdited) return false;
  // A running shift has no clocked end to compare: the change is the clock-in's (its end is the real one now).
  const facts = hoursRuleFacts({ ...entry, originalClockOut: entry.originalClockOut ?? clockOutAt, clockOutAt });
  return handChangeHolds(rules, entry.organizationId, facts);
}

/** What the close writes for such a shift: waiting, and labelled — nothing when it is not held. */
export async function handHoldAtClose(
  rules: ApprovalRulesService,
  entry: HandChanged & { organizationId: string },
  clockOutAt: Date,
  flags: readonly string[],
): Promise<{ approvalStatus?: 'PENDING'; flagReasons?: string[] }> {
  if (!(await handEditNeedsReview(rules, entry, clockOutAt))) return {};
  return { approvalStatus: 'PENDING', flagReasons: withHoursChanged(flags, true) };
}
