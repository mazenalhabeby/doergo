

import type { LeaveBalanceLedgerFields } from './leave-ledger';

// Task types
/** This year's vacation allowance for one person — now with the ledger's lines when the server has them. */
export interface LeaveBalance extends LeaveBalanceLedgerFields {
  year: number;
  allowance: number;
  taken: number;
  pending: number;
  remaining: number;
  /** True when this is a joiner's first year and the allowance is a share. */
  prorated?: boolean;
  /** What a full year would be — so the screen can show the share honestly. */
  fullAllowance?: number;
  startedOn?: string | null;
}

// ========================================================================
// TYPES FOR AVAILABILITY
// ========================================================================

export interface ScheduleEntry {
  id: string;
  technicianId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}


export interface ScheduleEntryInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  notes?: string;
}


export type TimeOffStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';


export interface TimeOffRequest {
  id: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: TimeOffStatus;
  approvedById?: string;
  approvedBy?: { id: string; firstName: string; lastName: string };
  approvedAt?: string;
  rejectionReason?: string;
  /** What it costs the allowance — weekends, rota rest days and holidays left out. Null on old rows. */
  workingDays?: number | null;
  /** What is asked — see @hbcfield/shared requests/request-kinds.ts. Absent on old rows = LEAVE. */
  kind?: import('@hbcfield/shared/client').RequestKind;
  /** LEAVE: VACATION | SICK | FAMILY | OTHER. */
  type?: string | null;
  /** The workspace it is about (REMOTE: always). */
  spaceId?: string | null;
  space?: { id: string; name: string } | null;
  /** HOURS: the day's new start / end, HH:MM local. */
  startTime?: string | null;
  endTime?: string | null;
  /** OVERTIME: minutes agreed in advance. */
  minutes?: number | null;
  createdAt: string;
  updatedAt: string;
}


/**
 * What approving a request would do to cover. Computed server-side (it needs
 * the whole roster and the rota, which a browser has no business holding) and
 * shaped as PARTS rather than a sentence, so the screen writes the words in the
 * viewer's language. See `assessLeave` in @hbcfield/shared for the rule.
 */
interface CoverName {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
}


export interface CoverDay {
  day: string;
  /** On the floor as things stand. */
  now: number;
  /** On the floor if this were approved. Same function, one argument different. */
  then: number;
  breach: boolean;
  skillGap: boolean;
  working: CoverName[];
  away: CoverName[];
}


export interface CoverVerdict {
  level: "ok" | "tight" | "short" | "skill";
  worst: number;
  floor: number;
  breachDays: number;
  skillGapDays: number;
  skill: string | null;
  /** False when nobody in the workspace has a rota — the count is headcount. */
  rotaKnown: boolean;
  /** The working out. Days the person was not rostered anyway are left out. */
  days: CoverDay[];
}


/** One workspace's cover for every day of a window — the chart footer. */
export interface CoverRangeSpace {
  spaceId: string;
  minCover: number;
  rotaKnown: boolean;
  days: Array<{ day: string; rostered: number; working: number }>;
}


export type OrgTimeOffRequest = TimeOffRequest & {
  technician: { id: string; firstName: string; lastName: string; email: string; specialty: string | null };
  /** Present on PENDING requests only — a decided one needs no projection. */
  cover?: CoverVerdict | null;
  /**
   * REMOTE only, when the server says it: may this person work away from a site
   * at the request's workspace right now (ceiling × grant)? Absent = not told.
   */
  mayWorkRemotely?: boolean | null;
};


/** One person on the live floor panel. */
export interface FloorPerson {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  position: string | null;
  /** Specialty when it was filled in, position otherwise. Print this one. */
  trade: string | null;
  /** leave → rest → break → busy/working → expected. See CoverService.floorNow. */
  state: "busy" | "working" | "break" | "expected" | "leave" | "rest";
  since: string | null;
  isRemote: boolean;
  breakSince: string | null;
  leaveUntil: string | null;
  /** When they were due in. Null when no rota or schedule says. */
  dueAt: string | null;
  /** Minutes past due — negative means still to come, so a screen stays calm. */
  lateMinutes: number | null;
  task: { id: string; title: string; status: string } | null;
}


/** One workspace's floor, right now. */
export interface FloorSpace {
  spaceId: string;
  spaceName: string;
  timezone?: string;
  minCover: number;
  /** Actually clocked in — from the clock. */
  here: number;
  /** Rostered and not on leave — from the rota. Deliberately a second number. */
  expected: number;
  status: "ok" | "tight" | "short";
  rotaKnown: boolean;
  people: FloorPerson[];
}
