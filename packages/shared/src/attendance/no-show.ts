/**
 * A NO-SHOW — a planned shift nobody clocked in for — and how it ENDS.
 *
 * It used to end one way: a leader pressed "Excuse". Everything else sat
 * "Escalated" for ever — the demo organization had 85 rows, mostly the same
 * three people on the same shift. Now:
 *
 *   1. The system closes what it can PROVE (`settleNoShow`): the person clocked
 *      in after all (late) or somebody added the hours, worked at another
 *      workspace in that shift's time, was on approved leave, has left, the
 *      rota no longer plans that shift that day, or the day is a public
 *      holiday. The reason is written on the row.
 *   2. What is left is ONE question to a leader in Approvals, with an answer
 *      that closes it: EXCUSED (with a reason) or ABSENT (a real missed day).
 *   3. The same person missing the same shift day after day is ONE item — a
 *      RUN (`noShowRuns`) — decided at once, and usually a rota to fix.
 *
 * Pure: no IO. Server, web and phone read it.
 */
import { localPartsIn } from './zoned-time';

/** Still waiting for somebody: being nudged, or told to a leader. */
export const NO_SHOW_OPEN_STATES = ['REMINDED', 'ESCALATED'] as const;
export const isOpenNoShow = (state: string | null | undefined): boolean =>
  !!state && (NO_SHOW_OPEN_STATES as readonly string[]).includes(state);

/** What a leader picks when excusing. */
export const NO_SHOW_EXCUSE_REASONS = ['SICK', 'FORGOT', 'AGREED', 'OTHER'] as const;
export type NoShowExcuseReason = (typeof NO_SHOW_EXCUSE_REASONS)[number];
export const isNoShowExcuseReason = (v: unknown): v is NoShowExcuseReason =>
  typeof v === 'string' && (NO_SHOW_EXCUSE_REASONS as readonly string[]).includes(v);

/** What the system closes by itself, with the proof it found. */
export const NO_SHOW_AUTO_REASONS = ['LEAVE', 'ELSEWHERE', 'HOLIDAY', 'SHIFT_REMOVED', 'LEFT'] as const;
export type NoShowAutoReason = (typeof NO_SHOW_AUTO_REASONS)[number];

export type NoShowCloseReason = NoShowExcuseReason | NoShowAutoReason;

/** What was found about one missed shift. Every field is read by the caller, in batch. */
export interface NoShowFacts {
  /** Clock-ins (not rejected) overlapping the shift's window, anywhere. */
  overlapping: { timeEntryId: string; spaceId: string }[];
  /** Approved LEAVE covering the shift's day. */
  onLeave: boolean;
  /** The person was switched off or is no longer in the organization. */
  memberGone: boolean;
  /** The rota as it stands now still plans this shift on this day for them. */
  stillPlanned: boolean;
  /** A full public holiday (or company day off) at the workspace that day. */
  holiday: boolean;
}

export type NoShowSettlement =
  | { state: 'PRESENT'; timeEntryId: string }
  | { state: 'EXCUSED'; reason: NoShowAutoReason; settledSpaceId?: string }
  | null;

/**
 * Can this missed shift be closed without asking anybody? `null` = no, ask.
 *
 * Order matters only where two are true at once, and then the stronger
 * evidence wins: a clock-in HERE is presence (late, or hours added after) —
 * nobody is excused for a day they worked; a clock-in elsewhere beats leave
 * (they worked, the rota was wrong); leave beats "left" and "rota changed".
 */
export function settleNoShow(inst: { spaceId: string }, f: NoShowFacts): NoShowSettlement {
  const here = f.overlapping.find((o) => o.spaceId === inst.spaceId);
  if (here) return { state: 'PRESENT', timeEntryId: here.timeEntryId };
  const elsewhere = f.overlapping[0];
  if (elsewhere) return { state: 'EXCUSED', reason: 'ELSEWHERE', settledSpaceId: elsewhere.spaceId };
  if (f.onLeave) return { state: 'EXCUSED', reason: 'LEAVE' };
  if (f.memberGone) return { state: 'EXCUSED', reason: 'LEFT' };
  if (!f.stillPlanned) return { state: 'EXCUSED', reason: 'SHIFT_REMOVED' };
  if (f.holiday) return { state: 'EXCUSED', reason: 'HOLIDAY' };
  return null;
}

/* ------------------------------------------------------------------ runs */

export interface NoShowRunRow {
  id: string;
  userId: string;
  spaceId: string;
  shiftId: string;
  localDate: string;
  state: string;
}

export interface NoShowRun {
  /** Every open no-show in the run, oldest first. */
  ids: string[];
  /** The newest — the one the inbox shows. */
  latestId: string;
  from: string;
  to: string;
  count: number;
}

/**
 * Consecutive open no-shows of ONE person on ONE shift at ONE workspace. A run
 * is broken by any instance of that shift that is not open (they came, it was
 * excused, it was marked absent) — so "4 in a row" means the four planned days
 * in a row, not four scattered over a month.
 *
 * `rows` must hold every instance of the shifts concerned in the window, in
 * any order. Returns each OPEN row's run, keyed by row id.
 */
export function noShowRuns(rows: readonly NoShowRunRow[]): Map<string, NoShowRun> {
  const byKey = new Map<string, NoShowRunRow[]>();
  for (const r of rows) {
    const k = `${r.userId}|${r.spaceId}|${r.shiftId}`;
    const list = byKey.get(k);
    if (list) list.push(r);
    else byKey.set(k, [r]);
  }
  const out = new Map<string, NoShowRun>();
  for (const list of byKey.values()) {
    list.sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
    let cur: NoShowRunRow[] = [];
    const flush = () => {
      if (!cur.length) return;
      const run: NoShowRun = {
        ids: cur.map((r) => r.id),
        latestId: cur[cur.length - 1]!.id,
        from: cur[0]!.localDate,
        to: cur[cur.length - 1]!.localDate,
        count: cur.length,
      };
      for (const r of cur) out.set(r.id, run);
      cur = [];
    };
    for (const r of list) {
      // PENDING = not yet due (today's, still in its grace): neither breaks nor joins.
      if (r.state === 'PENDING') continue;
      if (isOpenNoShow(r.state)) cur.push(r);
      else flush();
    }
    flush();
  }
  return out;
}

/* ---------------------------------------------------------- the record */

/** How one planned day ended, as the record draws it. */
export type NoShowDayMark = 'worked' | 'late' | 'excused' | 'absent' | 'open' | 'planned';

/** Minutes after the planned start that make a clock-in "late" on the record. */
export const NO_SHOW_LATE_AFTER_MINUTES = 10;

export function noShowDayMark(
  inst: { state: string; expectedClockInAt: string | Date },
  clockInAt?: string | Date | null,
): NoShowDayMark {
  if (inst.state === 'PRESENT') {
    if (!clockInAt) return 'worked';
    const late = new Date(clockInAt).getTime() - new Date(inst.expectedClockInAt).getTime();
    return late > NO_SHOW_LATE_AFTER_MINUTES * 60_000 ? 'late' : 'worked';
  }
  if (inst.state === 'EXCUSED') return 'excused';
  if (inst.state === 'ABSENT') return 'absent';
  if (isOpenNoShow(inst.state)) return 'open';
  return 'planned';
}

/** One person on the No-shows record. */
export interface NoShowPersonSummary {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  spaceNames: string[];
  /** The last days with a planned shift, oldest first (at most 7). */
  days: { localDate: string; mark: NoShowDayMark; instanceId: string }[];
  absent: number;
  excused: number;
  /** Closed by the system: late, leave, elsewhere, holiday, rota changed, left. */
  settled: number;
  open: number;
  /** Decided or settled no-shows in the period, newest first — what Reopen acts on. */
  closed: {
    id: string;
    localDate: string;
    spaceName: string;
    expectedClockInAt: string;
    state: 'EXCUSED' | 'ABSENT';
    closeReason: string | null;
    closedAutomatically: boolean;
    note: string | null;
  }[];
}

/**
 * "They were here": the Add attendance form filled in for the missed shift —
 * its day and hours in the WORKSPACE's zone (the form takes wall times there).
 * Null when the item does not carry what the form needs.
 */
export function noShowAttendancePrefill(data: Record<string, unknown>): {
  userId: string;
  locationId: string;
  date: string;
  startTime: string;
  endTime: string;
} | null {
  const userId = typeof data.userId === 'string' ? data.userId : null;
  const locationId = typeof data.spaceId === 'string' ? data.spaceId : null;
  const start = typeof data.expectedClockInAt === 'string' ? new Date(data.expectedClockInAt) : null;
  const end = typeof data.expectedClockOutAt === 'string' ? new Date(data.expectedClockOutAt) : null;
  if (!userId || !locationId || !start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const tz = typeof data.timezone === 'string' && data.timezone ? data.timezone : 'UTC';
  const s = localPartsIn(start, tz);
  const e = localPartsIn(end, tz);
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { userId, locationId, date: s.dateStr, startTime: hm(s.minutesOfDay), endTime: hm(e.minutesOfDay) };
}
