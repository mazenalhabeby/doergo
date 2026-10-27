import { handChangedMinutes } from '@hbcfield/shared';
import type { ApprovalRulesService } from '../../approvals/rules/approval-rules.service';

/**
 * Does a shift the office changed BY HAND while it was running have to wait for approval when it closes? Yes
 * when the whole change from what was clocked is past an office rule on changed hours — otherwise a clock-in
 * moved by four hours on a running shift would close automatic, since an edit with no clock-out cannot be judged
 * yet (entry-edit.service.ts). Untouched shifts ask nothing (no query).
 */
export async function handEditNeedsReview(
  rules: ApprovalRulesService | undefined,
  entry: {
    organizationId: string;
    locationId?: string | null;
    isEdited?: boolean | null;
    originalClockIn?: Date | null;
    originalClockOut?: Date | null;
    clockInAt: Date;
  },
  clockOutAt: Date,
): Promise<boolean> {
  if (!rules || !entry.isEdited) return false;
  // A running shift has no clocked end to compare: the change is the clock-in's (its end is the real one now).
  const minutes = handChangedMinutes({ ...entry, originalClockOut: entry.originalClockOut ?? clockOutAt, clockOutAt });
  if (minutes <= 0) return false;
  const facts = { spaceIds: entry.locationId ? [entry.locationId] : [], minutes };
  return !!(await rules.secondStepFor(entry.organizationId, 'hours', facts));
}
