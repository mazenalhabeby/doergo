/**
 * THE LEAVE LEDGER — how a vacation balance is built, line by line.
 *
 * A balance used to be one subtraction: allowance − vacation approved inside
 * HBCField this calendar year. An organization that started in August, whose
 * people had already used days in their old system, showed everybody a full
 * year left. The balance is now a SUM OF VISIBLE LINES:
 *
 *   allowance (computed: the person's or the organization's, pro-rated in a
 *              first year — never stored, so changing the allowance moves it)
 * + adjustments (STORED rows: used before HBCField, carried over, a correction,
 *                an extra day granted, carried days that expired — each with
 *                who, when and why)
 * − approved vacation in the leave year (computed from the requests, never
 *   copied — a cancelled request gives its days back with no second write)
 *
 * ⚠️ Only adjustments are stored. Storing the allowance or the taken days too
 * would be a second copy of a number that already has a source, and the two
 * disagree the first time anything changes.
 *
 * Pure — the server computes, the phone and the web show the same lines.
 */
export {
  LEAVE_ADJUSTMENT_KINDS,
  type LeaveAdjustmentKind,
  MANUAL_ADJUSTMENT_KINDS,
  isLeaveAdjustmentKind,
  LEAVE_YEAR_MODES,
  type LeaveYearMode,
  isLeaveYearMode,
  type LeaveYear,
  leaveYearOf,
  previousLeaveYear,
  CARRY_OVER_MODES,
  type CarryOverMode,
  type CarryOverRule,
  DEFAULT_CARRY_OVER_RULE,
  carryOverDays,
  carryExpiryDate,
} from './ledger/ledger-years';
export {
  carryExpiredDays,
  type LeaveAdjustmentRow,
  type LeaveBalanceLine,
  type LeaveBalance,
  leaveBalance,
  LEAVE_ADJUSTMENT_LIMITS,
  type LeaveAdjustmentInputError,
  type LeaveAdjustmentInput,
  parseLeaveAdjustment,
  type OpeningBalanceRow,
  parseOpeningBalances,
} from './ledger/ledger-balance';
