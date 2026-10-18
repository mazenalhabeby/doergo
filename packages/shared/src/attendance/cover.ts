/**
 * Cover: will there be enough people, and are they the right people?
 *
 * One rule, in one place, because four surfaces ask it and any two of them
 * disagreeing is worse than none of them asking: the leave wallchart's footer,
 * the verdict on a pending request, the "on the floor right now" panel, and the
 * warning a member sees when they ask for days.
 *
 * Everything here is PURE. The caller fetches rosters and leave; this decides.
 * That split is what lets the server compute a verdict for a hundred requests
 * from two queries, and lets a test state a scenario in six lines.
 *
 * The counterfactual is the point. `coverOn` takes an optional leave record to
 * treat as already approved, so "how many are on the floor" and "how many WOULD
 * be if I approved this" are the same function with one argument different —
 * they cannot drift into two answers.
 */
export {
  type DateKey,
  type Dow,
  type CoverShiftRule,
  type CoverPerson,
  type CoverLeave,
  type CoverSpace,
  tradeOf,
  sameTrade,
  leaveCovers,
  dowOf,
  shiftRuleMatches,
  isRosteredOn,
  hasRota,
  type DayCover,
  coverOn,
  eachDay,
} from './cover/roster';
export {
  type CoverLevel,
  type CoverDay,
  type CoverAssessment,
  assessLeave,
  type CoverVerdict,
  type CoverName,
  type CoverDayBrief,
  daysBrief,
  type CoverRangeDay,
  verdictOf,
  floorStatus,
  MIN_COVER_MAX,
  validateMinCover,
} from './cover/assess';
