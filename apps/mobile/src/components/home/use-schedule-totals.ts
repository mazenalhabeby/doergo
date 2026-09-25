import { useEffect, useRef, useState } from 'react';
import type { TimeEntry } from '@hbcfield/shared/client';
import { attendanceApi } from '../../lib/api/attendance';
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

const EMPTY: ScheduleTotals = { monthMinutes: null, weekMinutes: null, lastToday: null, lastIn: null };

/** Counted minutes on one entry. Never the word "paid" anywhere it is shown. */
function countedOn(e: TimeEntry): number {
  return e.paidMinutes ?? e.totalMinutes ?? 0;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

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

export function useScheduleTotals(input: {
  schedule: ScheduleKind;
  /** Re-ask when the shift changes — a clock-out adds today's figure. */
  revision: unknown;
  enabled: boolean;
}): ScheduleTotals {
  const [totals, setTotals] = useState<ScheduleTotals>(EMPTY);
  const { schedule, revision, enabled } = input;

  /*
    The period this answer belongs to. A phone left open across midnight — or
    across a month boundary — must not keep reporting last month's total as
    this one's, and re-fetching on a timer would be a request nobody asked for.
    Recomputed on every effect run, which is cheap; the FETCH is what is
    guarded.
  */
  const askedFor = useRef<string>('');

  useEffect(() => {
    if (!enabled) { setTotals(EMPTY); askedFor.current = ''; return; }
    let alive = true;
    const now = new Date();
    const week = startOfWeek(now);
    const month = startOfMonth(now);
    // One key for the whole answer: the period AND what the shift last did.
    const key = `${iso(month)}|${iso(week)}|${String(revision)}|${schedule}`;
    if (askedFor.current === key) return;
    askedFor.current = key;

    /*
      ⚠️ ONE REQUEST, NOT THREE. The month's entries contain this week's and
      today's, so the week total and today's finished shift are read out of the
      same answer rather than asked for again.

      `limit` is deliberately generous and finite: a month cannot hold more
      shifts than days times a handful, and an unbounded page is how a list
      request becomes a download on somebody's data plan.
    */
    void attendanceApi
      .getHistory({ startDate: iso(month), endDate: iso(now), limit: 200, page: 1 })
      .then((res) => {
        if (!alive) return;
        const entries = res?.data ?? [];
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
        setTotals({ monthMinutes, weekMinutes, lastToday, lastIn });
      })
      .catch(() => {
        /*
          ⚠️ SILENT, AND IT LEAVES THE FIGURES NULL. This is a courtesy number
          on a card whose real job is the clock; a failed total must not become
          an error state on the surface somebody uses to start their day. Null
          renders no hero figure and no bar, which is honest — a zero would be
          a claim.
        */
        if (alive) askedFor.current = '';
      });

    return () => { alive = false; };
  }, [enabled, revision, schedule]);

  return totals;
}
