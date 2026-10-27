/**
 * ONE ROUND OF OVERTIME, as a person reads it — what state it is in and how
 * many minutes it counted. Server (the period summary) and web (the Overtime
 * page, its live cards and the round's timeline) read the same answer.
 *
 * Why this exists: the page showed eight status codes in mixed words
 * ("Awaiting employee", "Missed by approver", "Declined", "Rejected") and
 * worked out the minutes itself — and a round that is approved stays APPROVED
 * after the clock-out (COMPLETED is the legacy flow's word only), so "is it
 * still running" and "how long did it count" are questions about the SHIFT,
 * not the status.
 *
 * Counted overtime is what the counted-time rule pays: from the round's start
 * (the planned end it extends) to the earlier of the agreed end and the
 * clock-out. Time past the agreed end is shown as "over", never counted.
 *
 * Pure: no IO.
 */

export type OvertimeRoundState =
  | 'RUNNING' // agreed, the person is still on the clock inside the agreed time
  | 'OVER' // agreed, still on the clock past the agreed end
  | 'DONE' // agreed and finished (clocked out, or a later round took over)
  | 'WAITING_PERSON' // the phone asked; the person has not answered yet
  | 'WAITING_DECISION' // waiting in Approvals
  | 'NO_ANSWER' // nobody decided in time
  | 'NOT_NEEDED' // the person said no, or did not reply
  | 'REFUSED'; // a leader said no

export const OVERTIME_ROUND_STATES: readonly OvertimeRoundState[] = [
  'RUNNING',
  'OVER',
  'DONE',
  'WAITING_PERSON',
  'WAITING_DECISION',
  'NO_ANSWER',
  'NOT_NEEDED',
  'REFUSED',
];

/** The fields a round is judged on — the OvertimeRequest columns plus its shift's clock-out. */
export interface OvertimeRoundFacts {
  status: string;
  maxDurationMinutes?: number | null;
  overtimeStartAt?: string | Date | null;
  overtimeEndAt?: string | Date | null;
  actualEndAt?: string | Date | null;
  /** The legacy flow's own figure, when it wrote one. */
  overtimeMinutes?: number | null;
  /** The shift's clock-out; null while it is still running. */
  clockOutAt?: string | Date | null;
  /** A later round on the same shift exists — this one's window is over. */
  superseded?: boolean;
}

const ms = (v: string | Date | null | undefined): number | null => {
  if (v == null) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/** A round that counts as overtime already agreed: APPROVED, or COMPLETED (the legacy flow's word for it). */
export const COUNTED_ROUND_STATUSES = ['APPROVED', 'COMPLETED'] as const;
const AGREED = new Set<string>(COUNTED_ROUND_STATUSES);
/** Does this round's overtime count as agreed? */
export const isCountedRound = (status: string) => AGREED.has(status);

export function overtimeRoundState(r: OvertimeRoundFacts, now: Date = new Date()): OvertimeRoundState {
  switch (r.status) {
    case 'PENDING_TECHNICIAN':
      return 'WAITING_PERSON';
    case 'PENDING_APPROVAL':
      return 'WAITING_DECISION';
    case 'REJECTED':
      return 'REFUSED';
    case 'EXPIRED_NO_APPROVAL':
      return 'NO_ANSWER';
    case 'CANCELED':
    case 'EXPIRED_NO_RESPONSE':
      return 'NOT_NEEDED';
  }
  if (!AGREED.has(r.status)) return 'DONE';
  if (r.status === 'COMPLETED' || r.superseded || ms(r.clockOutAt) != null) return 'DONE';
  const end = ms(r.overtimeEndAt);
  return end != null && now.getTime() > end ? 'OVER' : 'RUNNING';
}

/**
 * The round's minutes: what was agreed, what it counted, and how far past the
 * agreed end the person stayed (not counted). Zero for a round never agreed.
 */
export function overtimeRoundMinutes(
  r: OvertimeRoundFacts,
  now: Date = new Date(),
): { agreed: number; worked: number; overBy: number } {
  const agreed = AGREED.has(r.status) ? Math.max(0, r.maxDurationMinutes ?? 0) : 0;
  if (!AGREED.has(r.status)) return { agreed: 0, worked: 0, overBy: 0 };
  const start = ms(r.overtimeStartAt);
  const agreedEnd = ms(r.overtimeEndAt) ?? (start != null && agreed ? start + agreed * 60_000 : null);
  // Where the person actually stopped: the clock-out, else now while they are still on.
  const stopped = ms(r.clockOutAt) ?? (r.superseded ? agreedEnd : now.getTime());
  if (typeof r.overtimeMinutes === 'number' && r.overtimeMinutes >= 0 && r.status === 'COMPLETED') {
    return { agreed, worked: r.overtimeMinutes, overBy: 0 };
  }
  if (start == null || stopped == null) return { agreed, worked: 0, overBy: 0 };
  const end = agreedEnd != null ? Math.min(agreedEnd, stopped) : stopped;
  const worked = Math.max(0, Math.round((end - start) / 60_000));
  const overBy = agreedEnd != null && !r.superseded ? Math.max(0, Math.round((stopped - agreedEnd) / 60_000)) : 0;
  return { agreed, worked, overBy };
}

/** The period summary the Overtime page opens on (GET /overtime/summary). */
export interface OvertimeSummary {
  from: string;
  to: string;
  totals: {
    /** Counted overtime in the period, minutes. */
    workedMinutes: number;
    /** Rounds agreed in the period. */
    rounds: number;
    /** People with at least one agreed round. */
    people: number;
    /** Rounds nobody decided in time. */
    noAnswer: number;
    /** Rounds waiting in Approvals right now. */
    waiting: number;
  };
  /** Agreed rounds whose shift is still running — whatever the period. */
  running: OvertimeRunningRound[];
  people: OvertimePersonRow[];
}

export interface OvertimeRunningRound {
  id: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  spaceName: string;
  cycle: number;
  /** Rounds that shift has had so far, this one included. */
  roundsToday: number;
  maxDurationMinutes: number | null;
  overtimeStartAt: string | null;
  overtimeEndAt: string | null;
  timezone: string | null;
}

export interface OvertimePersonRow {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  spaceNames: string[];
  rounds: number;
  agreedMinutes: number;
  workedMinutes: number;
  /** Counted minutes per local day (YYYY-MM-DD), only days with any. */
  byDay: Record<string, number>;
}
