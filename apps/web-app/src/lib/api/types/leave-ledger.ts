import type { LeaveAdjustmentKind, LeaveBalanceLine, LeaveYear, LeaveYearMode } from '@hbcfield/shared/client';

/*
  The ledger's response shapes as the web reads them. They mirror the server
  half (shared `leave/leave-api.ts`, landing in parallel); when that is on main
  these become re-exports of it. `leaveLedgerApi` normalizes every response into
  them, so a screen never sees which envelope the server used.
*/

export interface LeaveLedgerPerson {
  id: string;
  firstName: string;
  lastName: string;
}

/** One stored line of a member's leave ledger. */
export interface LeaveAdjustmentDto {
  id: string;
  kind: LeaveAdjustmentKind;
  /** Signed, half days allowed. */
  days: number;
  /** YYYY-MM-DD — the first day of the leave year it belongs to. */
  leaveYearStart: string;
  reason: string | null;
  /** Typed by somebody, the starting-balances screen, or the carry-over rule. */
  source?: 'MANUAL' | 'OPENING' | 'CARRY_RULE';
  createdAt: string;
  /** null = written by the carry-over rule. */
  createdBy: LeaveLedgerPerson | null;
  /** Set once undone — the line stays, struck through, and counts for nothing. */
  voidedAt: string | null;
  voidedBy?: LeaveLedgerPerson | null;
}

/** GET /employees/:id/leave-adjustments, normalized. */
export interface LeaveLedger {
  leaveYear: LeaveYear | null;
  /** Newest first, undone lines included. */
  items: LeaveAdjustmentDto[];
  /** May the CALLER add or undo lines for this person — the server's answer (scope, never their own). */
  canEdit: boolean;
}

/** One member on the starting balances screen. */
export interface OpeningBalanceRowDto {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Used this leave year BEFORE HBCField (positive). */
  used: number;
  /** Carried in from last year. */
  carried: number;
  leaveYear?: LeaveYear;
  allowance?: number;
  remaining?: number;
}

/** GET /employees/leave-opening, normalized. */
export interface LeaveOpening {
  rows: OpeningBalanceRowDto[];
  /** null until starting balances are first saved; undefined when the server did not say. */
  trackingStartedOn?: string | null;
  mode?: LeaveYearMode;
}

/** What the server made of pasted text, normalized. */
export interface OpeningBalanceMatch {
  rows: Array<{ line: number; userId: string; name: string; used: number; carried: number }>;
  unmatched: Array<{ line: number; text: string; reason?: 'NOT_FOUND' | 'AMBIGUOUS' | 'DUPLICATE' }>;
  errors: Array<{ line: number; text: string }>;
}

/** The ledger fields on `GET /employees/:id/leave-balance` (absent on an older server). */
export interface LeaveBalanceLedgerFields {
  leaveYear?: LeaveYear;
  adjusted?: number;
  lines?: LeaveBalanceLine[];
  /** YYYY-MM-DD, last day carried days can be used; null/absent = they never expire. */
  carryExpiresOn?: string | null;
}

/** The organization's leave rules, as the organization profile carries them (absent on an older server). */
export interface LeavePolicyFields {
  defaultLeaveAllowance?: number;
  leaveYearMode?: LeaveYearMode;
  carryOverMode?: 'NONE' | 'UP_TO' | 'ALL';
  carryOverMaxDays?: number | null;
  carryExpiresAfterMonths?: number | null;
  /** YYYY-MM-DD — set once the starting balances were saved; null = never. */
  leaveTrackingStartedOn?: string | null;
}
