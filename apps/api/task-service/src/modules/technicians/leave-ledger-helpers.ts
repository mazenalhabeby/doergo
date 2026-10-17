import { BadRequestException } from '@nestjs/common';
import {
  OPENING_LIMITS,
  leaveYearOf,
  toISODateString,
  type CarryOverRule,
  type LeaveAdjustmentKind,
  type LeaveBalance,
  type LeaveYear,
  type LeaveYearMode,
} from '@hbcfield/shared';

/* What the ledger needs to know about an organization and a person — selected once, passed down. */
export const ORG_LEAVE_SELECT = {
  id: true,
  createdAt: true,
  timezone: true,
  defaultLeaveAllowance: true,
  leaveYearMode: true,
  carryOverMode: true,
  carryOverMaxDays: true,
  carryExpiresAfterMonths: true,
  leaveTrackingStartedOn: true,
} as const;

export const PERSON_LEAVE_SELECT = { id: true, organizationId: true, leaveAllowance: true, employmentStartDate: true, createdAt: true } as const;

export interface OrgLeave {
  id: string;
  createdAt: Date;
  timezone: string | null;
  defaultLeaveAllowance: number;
  leaveYearMode: LeaveYearMode | string;
  carryOverMode: string;
  carryOverMaxDays: number | null;
  carryExpiresAfterMonths: number | null;
  leaveTrackingStartedOn: Date | null;
}

export interface PersonLeave {
  id: string;
  organizationId?: string | null;
  leaveAllowance: number | null;
  employmentStartDate: Date | null;
  createdAt?: Date;
}

/** One person's leave year, computed: everything the balance, the ledger and the carry-over rule read. */
export interface PersonLeaveYear {
  userId: string;
  leaveYear: LeaveYear;
  allowance: number;
  fullAllowance: number;
  prorated: boolean;
  startedOn: string | null;
  adjustments: Array<{ kind: LeaveAdjustmentKind; days: number; sourceKey: string | null }>;
  balance: LeaveBalance;
  carryExpiresOn: string | null;
  /** Approved vacation taken from the leave year's start up to and including `day` (pure, no query). */
  takenUpTo: (day: string) => number;
}

const half = (n: number) => Math.round(n * 2) / 2;

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

const dayOf = (d: Date | null | undefined) => (d ? toISODateString(new Date(d)) : null);

const MEMBERS_WHERE = { isActive: true, isExternal: false, role: { not: 'CUSTOMER' } } as const;

const PERSON_BRIEF = { id: true, firstName: true, lastName: true } as const;

export function carryRuleOf(org: Pick<OrgLeave, 'carryOverMode' | 'carryOverMaxDays' | 'carryExpiresAfterMonths'>): CarryOverRule {
  return { mode: org.carryOverMode as CarryOverRule['mode'], maxDays: org.carryOverMaxDays, expiresAfterMonths: org.carryExpiresAfterMonths };
}

export function leaveYearFor(org: Pick<OrgLeave, 'leaveYearMode'>, person: Pick<PersonLeave, 'employmentStartDate'>, on: string): LeaveYear {
  return leaveYearOf({ mode: (org.leaveYearMode as LeaveYearMode) ?? 'CALENDAR', employmentStartDate: dayOf(person.employmentStartDate), on });
}

/** "Müller, Anna" / "anna  müller" → "anna muller". */
export function nameKey(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/,/g, ' ').trim().toLowerCase().split(/\s+/).join(' ');
}

const ADJUSTMENT_REFUSALS: Record<string, string> = {
  ADJUSTMENT_KIND_INVALID: 'Choose: used before HBCField, a correction, or extra days granted',
  ADJUSTMENT_DAYS_INVALID: 'Enter a number of days in half days, not zero',
  ADJUSTMENT_REASON_REQUIRED: 'Say why — a correction or a grant needs a reason',
  ADJUSTMENT_REASON_TOO_LONG: 'The reason is too long',
  ADJUSTMENT_DATE_INVALID: 'Choose a day inside the leave year (YYYY-MM-DD)',
};

/** The table a starting-balances save sends: ≤ 500 people, each once, half days 0–366. */
export function readOpeningRows(raw: unknown): Array<{ userId: string; used: number; carried: number }> {
  if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestException({ code: 'OPENING_ROWS_EMPTY', message: 'Nothing to save' });
  if (raw.length > OPENING_LIMITS.MAX_ROWS) throw new BadRequestException({ code: 'OPENING_TOO_MANY_ROWS', message: `At most ${OPENING_LIMITS.MAX_ROWS} people at a time` });
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 366 && half(n) === n;
  const seen = new Set<string>();
  return raw.map((r) => {
    const row = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    const used = row.used ?? 0, carried = row.carried ?? 0;
    if (typeof row.userId !== 'string' || !row.userId || seen.has(row.userId) || !ok(used) || !ok(carried)) {
      throw new BadRequestException({ code: 'OPENING_ROW_INVALID', message: 'Each person once, with days in half days from 0 to 366' });
    }
    seen.add(row.userId);
    return { userId: row.userId, used: used as number, carried: carried as number };
  });
}

export { half, asDate, dayOf, MEMBERS_WHERE, PERSON_BRIEF, ADJUSTMENT_REFUSALS };
