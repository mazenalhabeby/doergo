import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceApi, type NoShow } from '../../lib/api/attendance';
import type { CrewPerson } from './crew-state';
import { useLiveRefresh } from '../../hooks/use-live-refresh';

/**
 * The Crew card's data — three existing endpoints, no new ones.
 *
 *   GET /attendance/all-entries?status=CLOCKED_IN&limit=…   who is on, with the
 *       workspace, clock-in and expected end (the narrow `active-entries` has
 *       none of those — ids and times only)
 *   GET /attendance/breaks/active                          who is on a rest
 *   GET /attendance/no-shows?days=1                        rostered, not in
 *   GET /attendance/approvals/pending?page=1&limit=1       shifts waiting
 *
 * Every one is `canViewSpaceAttendance` and narrowed by the SERVER to the
 * caller's spaces, so an admin sees the organization and a site lead their
 * site with nothing filtered here.
 *
 * ⚠️ BOUNDED. `all-entries` takes a limit — FINDINGS §01 was an unbounded
 * `findMany` on every home render to draw one number. This asks for a page.
 *
 * ⚠️ NO-SHOWS FOR TODAY ONLY — `days=1`. A week never empties, so "hidden when
 * empty" stopped working and the band was open every day (FINDINGS §04).
 *
 * ⚠️ PRESENCE IS NEVER KEPT. A failure is `failed`, and the card shows a dash:
 * stale is wrong, not old. Nothing here is written to the phone's store.
 */

const ACTIVE_LIMIT = 300;
const REFRESH_MS = 60_000;

export interface CrewData {
  people: CrewPerson[];
  /** Everybody expected by now: on the clock + rostered and not in. 0 = no roster in scope. */
  expected: number;
  /** Shifts done and waiting for a decision. */
  pending: number;
  /** The same, per workspace — the rings' amber badge. Read from the first page only. */
  pendingBySpace: Record<string, number>;
  /** Not-arrived rows, for the exception line. */
  notArrived: NoShow[];
  failed: boolean;
  loading: boolean;
  /** When this answer was asked — the card's clock. */
  at: number;
}

const EMPTY: CrewData = { people: [], expected: 0, pending: 0, pendingBySpace: {}, notArrived: [], failed: false, loading: true, at: Date.now() };

type ActiveEntry = {
  id: string; userId: string; locationId?: string | null; clockInAt: string;
  expectedClockOutAt?: string | null; endIsDailyLimit?: boolean | null;
  breakPlan?: { ruleId: string; durationMinutes: number }[] | null;
  user?: { id: string; firstName?: string; lastName?: string } | null;
  location?: { id: string; name?: string } | null;
};
type ActiveBreak = { userId?: string; startedAt: string; ruleId?: string | null; timeEntryId?: string; user?: { id: string } | null };

export function useCrew(enabled: boolean): CrewData & { refresh: () => void } {
  const [data, setData] = useState<CrewData>(EMPTY);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const [entries, breaks, noShows, pending, pendingRows] = await Promise.all([
        attendanceApi.getAllEntries({ status: 'CLOCKED_IN', limit: ACTIVE_LIMIT }) as unknown as Promise<ActiveEntry[]>,
        attendanceApi.getActiveBreaks().catch(() => []) as Promise<ActiveBreak[]>,
        attendanceApi.listNoShows(1).catch(() => [] as NoShow[]),
        attendanceApi.countPendingApprovals().catch(() => 0),
        /* ⚠️ Bounded: one page, only to split the count by workspace for the rings. */
        attendanceApi.getPendingApprovals({ page: 1, limit: 100 }).catch(() => []),
      ]);
      const pendingBySpace: Record<string, number> = {};
      for (const e of pendingRows as unknown as { locationId?: string | null }[]) {
        if (e.locationId) pendingBySpace[e.locationId] = (pendingBySpace[e.locationId] ?? 0) + 1;
      }
      const now = Date.now();
      const onBreak = new Map<string, ActiveBreak>();
      for (const b of breaks) onBreak.set(b.timeEntryId ?? b.user?.id ?? b.userId ?? '', b);

      const people: CrewPerson[] = entries.map((e) => {
        const brk = onBreak.get(e.id) ?? onBreak.get(e.userId);
        /*
          ⚠️ An allowance exists only for a PLANNED rest — the plan item the
          break satisfies. A break somebody simply took has no allowance, so it
          can never be "over"; saying otherwise would invent a rule.
        */
        const planned = brk?.ruleId ? (e.breakPlan ?? []).find((p) => p.ruleId === brk.ruleId) : undefined;
        return {
          userId: e.userId,
          firstName: e.user?.firstName ?? '—',
          lastName: e.user?.lastName ?? null,
          spaceId: e.locationId ?? e.location?.id ?? null,
          spaceName: e.location?.name ?? null,
          clockInAt: e.clockInAt,
          expectedClockOutAt: e.expectedClockOutAt ?? null,
          endIsDailyLimit: e.endIsDailyLimit ?? null,
          breakMinutes: brk ? Math.max(0, Math.round((now - Date.parse(brk.startedAt)) / 60000)) : null,
          breakAllowanceMinutes: planned?.durationMinutes ?? null,
        };
      });

      const onIds = new Set(people.map((p) => p.userId));
      /* Not arrived: today's open no-shows whose start has passed, and who are not on now. */
      const notArrived = noShows.filter((n) =>
        !onIds.has(n.userId) && Date.parse(n.expectedClockInAt) <= now && !['EXCUSED', 'RESOLVED', 'ARRIVED'].includes(n.state));
      for (const n of notArrived) {
        const [firstName, ...rest] = (n.userName ?? '').split(' ');
        people.push({
          userId: n.userId, firstName: firstName || '—', lastName: rest.join(' ') || null, avatarUrl: n.avatarUrl ?? null,
          spaceId: n.spaceId, spaceName: n.spaceName, clockInAt: null, scheduledStartAt: n.expectedClockInAt,
          expectedClockOutAt: n.expectedClockOutAt,
        });
      }
      if (live.current) setData({ people, expected: people.length, pending, pendingBySpace, notArrived, failed: false, loading: false, at: now });
    } catch {
      if (live.current) setData((d) => ({ ...d, people: [], failed: true, loading: false, at: Date.now() }));
    }
  }, [enabled]);

  /* On every return to the home screen, when the app comes back, and once a minute — rings move. */
  useLiveRefresh(refresh, REFRESH_MS);

  return { ...data, refresh: () => void refresh() };
}
