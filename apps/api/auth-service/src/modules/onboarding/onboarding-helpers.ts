import { toISODateString, type LeavePolicyError } from '@hbcfield/shared';

/* The organization's leave policy as the API carries it (shared leave/leave-api.ts). */
const LEAVE_POLICY_SELECT = {
  defaultLeaveAllowance: true,
  leaveYearMode: true,
  carryOverMode: true,
  carryOverMaxDays: true,
  carryExpiresAfterMonths: true,
  leaveTrackingStartedOn: true,
} as const;

/** A DATE column read back as its day, never an instant a browser would move a day west. */
function leavePolicyOf(org: { defaultLeaveAllowance: number; leaveYearMode: string; carryOverMode: string; carryOverMaxDays: number | null; carryExpiresAfterMonths: number | null; leaveTrackingStartedOn: Date | null }) {
  return {
    defaultLeaveAllowance: org.defaultLeaveAllowance,
    leaveYearMode: org.leaveYearMode,
    carryOverMode: org.carryOverMode,
    carryOverMaxDays: org.carryOverMaxDays,
    carryExpiresAfterMonths: org.carryExpiresAfterMonths,
    leaveTrackingStartedOn: org.leaveTrackingStartedOn ? toISODateString(org.leaveTrackingStartedOn) : null,
  };
}

const LEAVE_POLICY_REFUSALS: Record<LeavePolicyError, string> = {
  LEAVE_ALLOWANCE_INVALID: 'Annual vacation days must be a whole number between 0 and 100',
  LEAVE_YEAR_MODE_INVALID: 'The leave year is the calendar year or the work year',
  CARRY_OVER_MODE_INVALID: 'Carry-over is none, up to a number of days, or all days',
  CARRY_OVER_MAX_INVALID: 'Carrying "up to" needs a whole number of days between 1 and 100',
  CARRY_EXPIRY_INVALID: 'Carried days expire after 1 to 24 months, or never',
  LEAVE_TRACKING_DATE_INVALID: 'Choose a valid day (YYYY-MM-DD)',
  LEAVE_POLICY_EMPTY: 'Nothing to change',
};

export { LEAVE_POLICY_SELECT, leavePolicyOf, LEAVE_POLICY_REFUSALS };
