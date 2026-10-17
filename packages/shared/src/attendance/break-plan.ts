
/**
 * A rest is planned, not merely permitted.
 *
 * Until now a break existed only once somebody took one: nothing said when it
 * was due, nothing asked, and a workspace could not express "half an hour,
 * somewhere around midday, and it comes off the paid hours". A rest that is only
 * allowed is a rest that is skipped on a busy day and argued about at the end of
 * the month.
 *
 * The rules are configuration. This turns them, once, at clock-in, into concrete
 * instants for one person's one shift — a PLAN, frozen onto the time entry. The
 * reminder sweep then reads a plan and never a rule: it joins nothing, and a rule
 * edited at noon cannot retroactively rearrange somebody's afternoon.
 */
export {
  type BreakTrigger,
  type BreakRuleLike,
  type BreakPlanState,
  type BreakPlanItem,
  MAX_SNOOZES_DEFAULT,
  MIN_SNOOZE_MINUTES,
  type BreakPlanContext,
  resolveBreakPlan,
  outstandingBreaks,
  isRemindable,
  breakAttentionAt,
  nextBreakRemindAt,
  breakNeedingAttention,
} from './break-plan/plan';
export {
  tapSatisfiesPlannedRest,
  plannedRestForTap,
  isExpired,
  snooze,
  markTaken,
  markMissed,
  missedRequired,
  MISSED_REST_FLAG,
  requiredRestsMissed,
  flagsWithMissedRest,
  parseBreakPlan,
} from './break-plan/taps';
