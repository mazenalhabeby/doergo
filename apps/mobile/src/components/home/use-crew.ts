import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceApi, type NoShow } from '../../lib/api/attendance';
import { crewAsOf, crewPeopleFrom, type CrewAsOf, type CrewPerson, type CrewEntryInput, type CrewBreakInput } from './crew-state';
import { keep, keptNow, keptOnDisk } from '../../home/remember/store';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { connectivity } from '../../offline/connectivity';

/**
 * The Crew card's data — three existing endpoints, no new ones.
 *
 *   GET /attendance/all-entries?status=CLOCKED_IN&limit=…   who is on, with the
 *       workspace, clock-in and expected end (the narrow `active-entries` has
 *       none of those — ids and times only)
 *   GET /attendance/breaks/active                          who is on a rest
 *   GET /attendance/no-shows?days=1                        rostered, not in
 *   GET /attendance/approvals/pending?summary=true         shifts waiting, per workspace (counts only)
 *
 * Every one is `canViewSpaceAttendance` and narrowed by the SERVER to the
 * caller's spaces, so an admin sees the organization and a site lead their
 * site with nothing filtered here.
 *
 * ⚠️ BOUNDED. `all-entries` takes a limit — FINDINGS §01 was an unbounded
 * `findMany` on every home render to draw one number. This asks for a page.
 *
 * ⚠️ NO-SHOWS FOR TODAY ONLY — `days=1`, then cut to the phone's day in
 * `crewPeopleFrom` (the server's window is a rolling 24 hours). A week never
 * empties, so "hidden when empty" stopped working and the band was open every
 * day (FINDINGS §04).
 *
 * ⚠️ PRESENCE IS NEVER KEPT. A failure is `failed`, and the card shows a dash:
 * stale is wrong, not old. Nothing here is written to the phone's store.
 */

const REFRESH_MS = 60_000;

export interface CrewData {
  people: CrewPerson[];
  /** Everybody expected by now: on the clock + rostered and not in. 0 = no roster in scope. */
  expected: number;
  /** Shifts done and waiting for a decision. */
  pending: number;
  /** The same, per workspace — the rings' amber badge. */
  pendingBySpace: Record<string, number>;
  /** Not-arrived rows, for the exception line. */
  notArrived: NoShow[];
  failed: boolean;
  loading: boolean;
  /** When this answer was asked — the card's clock. */
  at: number;
  /** With no answer: the last known COUNTS and their time (never people). */
  asOf: CrewAsOf | null;
}

/** Counts only, today only, per user — see `crewAsOf`. */
const AS_OF = 'crew-asof';
const AS_OF_RULES = { sameDay: true } as const;

const EMPTY: CrewData = { people: [], expected: 0, pending: 0, pendingBySpace: {}, notArrived: [], failed: false, loading: true, at: Date.now(), asOf: null };

/** `userId` keys the kept counts — per person, never shared on a shared phone. */
export function useCrew(enabled: boolean, userId: string | null = null): CrewData & { refresh: () => void } {
  const [data, setData] = useState<CrewData>(EMPTY);
  /** The failed state, with the last known counts when there are any. */
  const failWith = useCallback(async (current: () => boolean) => {
    /*
      ⚠️ AT ONCE, THEN THE DISK. The rings go the instant the signal does —
      waiting on storage first would leave live-looking presence on screen for
      a frame. What the last run kept arrives after, if it is still wanted.
    */
    const now = keptNow<CrewAsOf>(AS_OF, userId, AS_OF_RULES);
    if (current()) setData((d) => ({ ...d, people: [], notArrived: [], failed: true, loading: false, at: Date.now(), asOf: now }));
    if (now) return;
    const disk = await keptOnDisk<CrewAsOf>(AS_OF, userId, AS_OF_RULES);
    if (disk && current()) setData((d) => (d.failed ? { ...d, asOf: disk } : d));
  }, [userId]);
  const live = useRef(true);
  /*
    ⚠️ LATEST ASK WINS. Focus, the minute tick and the app coming back can all
    fire together; without a sequence the slower, OLDER answer landed last and
    replaced the newer one — presence going backwards on screen.
  */
  const seq = useRef(0);
  useEffect(() => () => { live.current = false; }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const mine = ++seq.current;
    const current = () => live.current && mine === seq.current;
    /*
      ⚠️ NO SIGNAL, NO FOUR REQUESTS. They could only fail — after a retry each
      — and the answer is the one a failure gives anyway: presence is not kept,
      so the card says it needs a connection. Straight away, on a cold start in
      a basement, rather than after the round trips time out.
    */
    if (connectivity.state === 'offline') {
      await failWith(current);
      return;
    }
    try {
      /*
        ⚠️ PRESENCE FAILS AS A WHOLE. Who is on, who is on a rest and who has
        not come are one answer; swallowing a failed no-show read drew
        "Everyone is in. Nothing to decide." over somebody an hour late. Only
        the approval COUNT may fall back — it is not presence.
      */
      const [entries, breaks, noShows, pendingSummary] = await Promise.all([
        attendanceApi.getClockedInAll() as unknown as Promise<CrewEntryInput[]>,
        attendanceApi.getActiveBreaks() as Promise<CrewBreakInput[]>,
        attendanceApi.listNoShows(1) as Promise<NoShow[]>,
        /* ⚠️ Counts only — the total and one per workspace for the rings, in bytes. */
        attendanceApi.pendingApprovalsSummary().catch(() => ({ total: 0, bySpace: {} as Record<string, number> })),
      ]);
      const now = Date.now();
      const { people, notArrived } = crewPeopleFrom({ entries, breaks, noShows, now });
      if (current()) {
        setData({
          people, expected: people.length, pending: pendingSummary.total, pendingBySpace: pendingSummary.bySpace,
          notArrived: notArrived as NoShow[], failed: false, loading: false, at: now, asOf: null,
        });
        keep(AS_OF, userId, crewAsOf(people, now), AS_OF_RULES);
      }
    } catch {
      await failWith(current);
    }
  }, [enabled, userId, failWith]);

  /*
    ⚠️ THE MOMENT THE SIGNAL GOES, THE RINGS GO. Presence drawn while offline
    ages under a clock that says it is current — the answer on screen was
    right a minute ago and is already the kind of stale this card refuses to
    draw. The next answer comes with the signal (`onReconnect` below).
  */
  useEffect(() => {
    if (!enabled) return;
    return connectivity.subscribe((now) => {
      if (now !== 'offline' || !live.current) return;
      const mine = ++seq.current;
      void failWith(() => live.current && mine === seq.current);
    });
  }, [enabled, failWith]);

  /* On every return to the home screen, when the app comes back, once a minute — rings move — and when the signal returns. */
  useLiveRefresh(refresh, REFRESH_MS, { onReconnect: true });

  return { ...data, refresh: () => void refresh() };
}
