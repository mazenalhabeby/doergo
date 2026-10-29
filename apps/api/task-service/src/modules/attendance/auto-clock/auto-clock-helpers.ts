import { autoClockActive, effectiveClockRules, type MemberAutoClockSettings } from '@hbcfield/shared';
import { Prisma } from '@prisma/client';
import { type DayRequestRow } from '../core/approved-requests';

/** The audit row an undo leaves — the only trace once the entry is gone, and what makes a replayed undo answer "done". */
export const AUTO_UNDO_EVENT = 'TIME_ENTRY_AUTO_UNDONE';

/** Steps that mean work was recorded during an automatic clock-in — after them it cannot be undone. */
const WORK_EVENTS = ['STATUS_CHANGED', 'CREW_JOINED', 'RESUMED', 'SELF_RESUMED', 'TAKEN'] as const;

/** The minimum the entries a sweep holds must carry to be asked "is this an automatic member?". */
interface EntryRef {
  id: string;
  userId: string;
  locationId: string;
  clockInAt: Date;
}

/**
 * The automatic clock's server half (shared attendance/auto-clock.ts).
 *
 * The phone decides arrival and departure OFFLINE and files the step in its
 * outbox; everything it sends is re-checked here and by the ordinary clock-in /
 * clock-out, which run exactly as for a tap. This service answers the three
 * questions only the automatic clock asks: where to arm (the plan), may the
 * owner take it back (undo), and is this member automatic at all — for one
 * entry, or for a sweep's whole batch in one query.
 *
 * ⚠️ ON = workspace settings enabled ∧ the member chosen there ∧ the member's
 * own consent (`autoClockActive`). Any one missing and the step is an ordinary
 * one — never refused, never marked.
 */
/**
 * What "is this member automatic, and how" reads — one select, one mapping, so
 * the clock-in, the clock-out, the sweeps and the plan cannot answer it differently.
 * The hours without a shift are read LIVE: changing them on the workspace — or
 * the member's OWN hours there ("works here as" / own daily hours, through
 * `effectiveClockRules`) — changes them for every running session at once, so
 * "Still working?", the leader and the close go by the person's own day.
 */
const MEMBER_AUTO_CLOCK_SELECT = {
  autoClock: true,
  autoClockMode: true,
  autoClockStartWindow: true,
  workAs: true,
  workDailyMinutes: true,
  space: { select: { autoClock: true, noShiftDailyMinutes: true, noShiftPolicy: true } },
  user: { select: { autoClockConsentAt: true, isExternal: true } },
} as const;

function memberAutoClock(row: {
  autoClock: boolean;
  autoClockMode: string;
  autoClockStartWindow: Prisma.JsonValue | null;
  workAs?: string | null;
  workDailyMinutes?: number | null;
  space: { autoClock: Prisma.JsonValue | null; noShiftDailyMinutes: number; noShiftPolicy: string };
  user: { autoClockConsentAt: Date | null; isExternal: boolean };
}): MemberAutoClockSettings | null {
  const own = effectiveClockRules(row.space, row);
  return autoClockActive({
    consentAt: row.user.autoClockConsentAt,
    settings: row.space.autoClock,
    assignmentAutoClock: row.autoClock,
    isExternal: row.user.isExternal,
    mode: row.autoClockMode,
    startWindow: row.autoClockStartWindow,
    noShiftDailyMinutes: own.noShiftDailyMinutes,
    noShiftPolicy: own.noShiftPolicy,
  });
}

function dedupeById(rows: DayRequestRow[]): DayRequestRow[] {
  const seen = new Map<string, DayRequestRow>();
  for (const r of rows) seen.set(r.id, r);
  return [...seen.values()];
}

export { WORK_EVENTS, EntryRef, MEMBER_AUTO_CLOCK_SELECT, memberAutoClock, dedupeById };
