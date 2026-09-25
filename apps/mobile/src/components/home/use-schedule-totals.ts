import { useCallback } from 'react';
import type { TimeEntry } from '@hbcfield/shared/client';
import { attendanceApi } from '../../lib/api/attendance';
import { useRemembered } from '../../home/remember/use-remembered';
import type { ScheduleKind } from './shift-state';

/**
 * WHAT THIS MEMBER HAS COUNTED THIS MONTH, THIS WEEK, AND TODAY.
 *
 * The three figures the card needs when nobody is on the clock — because the
 * hero before clocking in is whatever that person is measured against:
 *
 *   FIXED     the rostered start        (no total needed)
 *   FLEXIBLE  the month against budget  → `monthMinutes`
 *   NONE      this week's total         → `weekMinutes`
 *
 * and `lastToday` is what turns ① into ⑥: a shift that ended today means the
 * hero is what they EARNED, not what time they are due.
 *
 * ⚠️ ASKED ONCE PER PERIOD, NOT ONCE PER RENDER. §2's warning is about shape:
 * *"summing a month on the phone on every render is the wrong shape"*. It asks
 * for a server-side count, and there is no member-reachable endpoint that
 * gives one — `/attendance/reports/{summary,weekly,monthly}` all require
 * `canViewSpaceAttendance`, a permission a member looking at their own card
 * does not hold. So the month is fetched ONCE, summed ONCE, and kept; the
 * component re-reads a number, never a list.
 *
 * ⚠️ AND ONLY WHAT IS ACTUALLY NEEDED. A FIXED member never triggers the month
 * request: the card would not show it, so asking for it is a round trip spent
 * on a figure nobody will read. Rule — a row you cannot see makes no request.
 *
 * ⚠️ `paidMinutes` IS THE COUNTED FIGURE, and `totalMinutes` is the fallback
 * for entries closed before the counted-time rule existed. Neither is ever
 * called "paid" on screen — see rule 4.
 */
export interface ScheduleTotals {
  /** Month-to-date counted minutes. Null until asked for, or if the ask failed. */
  monthMinutes: number | null;
  /** This week's counted minutes. Same. */
  weekMinutes: number | null;
  /** Today's finished shift, if there is one — drives ⑥. */
  lastToday: TimeEntry | null;
  /** When they last clocked in at all — ① NONE's `last in on Friday`. */
  lastIn: Date | null;
}

/**
 * ⚠️ `ready` IS NOT `lastToday !== null`. "No shift ended today" and "we have
 * not been told yet" are the same `null`, and the card chooses between ① and
 * ⑥ on exactly that — so before this existed it announced `Ready to start` to
 * somebody who had already finished, until a second request landed.
 */
export interface ScheduleTotalsView extends ScheduleTotals {
  ready: boolean;
}

const EMPTY: ScheduleTotals = { monthMinutes: null, weekMinutes: null, lastToday: null, lastIn: null };

/**
 * ⚠️ STORAGE HOLDS NO DATES. `lastIn` goes out as a Date and comes back a
 * string, and `① last in on Friday` would then call `.getTime()` on it.
 */
function revive(t: ScheduleTotals): ScheduleTotals {
  return { ...t, lastIn: t.lastIn ? new Date(t.lastIn) : null };
}

/** Counted minutes on one entry. Never the word "paid" anywhere it is shown. */
function countedOn(e: TimeEntry): number {
  return e.paidMinutes ?? e.totalMinutes ?? 0;
}

/**
 * `2026-09-01` — the LOCAL calendar day, never the UTC one.
 *
 * ⚠️ `toISOString().slice(0,10)` IS A UTC DATE. Local midnight on the 1st in
 * UTC+2 is `2026-08-31T22:00Z`, so the month asked for started on 31 August
 * and the week on the 20th — an off-by-one-day on every boundary, invisible in
 * London and wrong everywhere else. The server compares calendar days, so it
 * must be given the member's own.
 */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  // Monday. `getDay()` is 0 on Sunday, which is the end of the week here.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function startOfMonth(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * The month's entries → the three figures. Pure, so the boundary rules below
 * are testable without a network.
 */
export function readTotals(entries: readonly TimeEntry[], now: Date): ScheduleTotals {
  const week = startOfWeek(now);
  const today = iso(now);
  let monthMinutes = 0;
  let weekMinutes = 0;
  let lastToday: TimeEntry | null = null;
  let lastIn: Date | null = null;
  for (const e of entries) {
    if (!e.clockOutAt) continue; // a running shift is not a total yet
    const m = countedOn(e);
    monthMinutes += m;
    const at = new Date(e.clockInAt);
    if (!lastIn || at > lastIn) lastIn = at;
    if (at >= week) weekMinutes += m;
    if (iso(at) === today) {
      // The LAST one that ended today, by clock-out.
      if (!lastToday || new Date(e.clockOutAt) > new Date(lastToday.clockOutAt!)) lastToday = e;
    }
  }
  return { monthMinutes, weekMinutes, lastToday, lastIn };
}

export function useScheduleTotals(input: {
  schedule: ScheduleKind;
  /** Re-ask when the shift changes — a clock-out adds today's figure. */
  revision: unknown;
  enabled: boolean;
  /** Whose totals. Remembering them is per member — see `remember/store.ts`. */
  userId: string | null;
}): ScheduleTotalsView {
  const { schedule, revision, enabled, userId } = input;

  /*
    ⚠️ ONE REQUEST, NOT THREE. The month's entries contain this week's and
    today's, so the week total and today's finished shift are read out of the
    same answer rather than asked for again.

    `limit` is deliberately generous and finite: a month cannot hold more
    shifts than days times a handful, and an unbounded page is how a list
    request becomes a download on somebody's data plan.
  */
  const load = useCallback(async (): Promise<ScheduleTotals> => {
    const now = new Date();
    const month = startOfMonth(now);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    /*
      ⚠️ `endDate` IS TOMORROW, NOT TODAY. A date-only range whose end is today
      is read as midnight at the START of today by anything that compares
      instants — so the shift that just ended falls outside it and ⑥ never
      appears, on the one day it is about. Asking to tomorrow is correct
      whether the server treats the bound as inclusive or not.
    */
    const res = await attendanceApi.getHistory({ startDate: iso(month), endDate: iso(tomorrow), limit: 200, page: 1 });
    /*
      ⚠️ `/attendance/history` RETURNS A BARE ARRAY, NOT A PAGINATED ENVELOPE —
      whatever `attendanceApi.getHistory`'s return type says. The server
      answers `{ success, data: [ … ] }`, `fetchWithAuth` unwraps the one
      `data`, and what arrives here is the LIST. Reading `res.data` gave
      `undefined` on every call, so every total was 0 and ⑥ could never appear
      — with a 200 and no error anywhere to say so.

      Both shapes are accepted rather than one, because the declared type says
      envelope and the server says array, and this must not break on the day
      one of them changes.
    */
    const entries: TimeEntry[] = Array.isArray(res) ? (res as unknown as TimeEntry[]) : (res?.data ?? []);
    return readTotals(entries, now);
  }, []);

  /*
    ⚠️ THE PERIOD IS PART OF THE QUESTION. A phone left open across midnight —
    or across a month boundary — must not keep reporting last month's total as
    this one's, and re-fetching on a timer would be a request nobody asked for.

    ⚠️ AND `sameDay`, BECAUSE `lastToday` MEANS TODAY. A remembered copy from
    yesterday would greet somebody with `Done for today` before they started.
  */
  const now = new Date();
  const kept = useRemembered<ScheduleTotals>({
    name: 'schedule-totals',
    userId,
    load,
    revision: `${iso(startOfMonth(now))}|${iso(startOfWeek(now))}|${String(revision)}|${schedule}`,
    enabled,
    sameDay: true,
    revive,
  });

  /*
    ⚠️ A FAILED TOTAL IS SILENT AND LEAVES THE FIGURES NULL. This is a
    courtesy number on a card whose real job is the clock; it must not become
    an error state on the surface somebody uses to start their day. Null
    renders no hero figure and no bar, which is honest — a zero would be a
    claim.

    ⚠️ AND NOT ASKING IS AN ANSWER. A FIXED member on the clock is measured
    against today's shift and no history is fetched for them at all, so `ready`
    is true there — or the card would wait for a request never made.
  */
  return { ...(kept.data ?? EMPTY), ready: kept.ready };
}
