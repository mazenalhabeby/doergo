import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AttendanceStatus, BreakStatus, BreakType, OccurrenceFix } from '@hbcfield/shared/client';
import { attendanceApi } from '../../lib/api/attendance';
import type { ActionOutcome } from '../actions/outcome';
import type { RecordsStore } from '../db/records-store';
import { useAuth } from '../../contexts/auth-context';
import { useOffline, useSyncStatus } from '../offline-context';
import { keep, keptNow, keptOnDisk } from '../../home/remember/store';
import { isUnreachable } from '../actions/unreachable';
import { knownOffline } from '../connectivity';
import { overlayShift, type ShiftView } from './shift-overlay';
import { clockInFromPhone, clockOutFromPhone, endRestFromPhone, requestExtraTimeFromPhone, resolveClockOutFromPhone, startRestFromPhone } from './shift-actions';

const SCOPE = 'attendance';
/** ⚠️ One question per name — see `home/remember/store.ts`. */
const KEPT = 'shift';

/** What is remembered between runs — see `home/remember/store.ts`. */
interface Kept {
  status: AttendanceStatus | null;
  breaks: BreakStatus | null;
  serverAt: number;
}

interface Loaded {
  status: AttendanceStatus | null;
  breaks: BreakStatus | null;
  /** When the server answered (epoch ms); 0 when this came from the phone. */
  serverAt: number;
  /**
   * ⚠️ `pending` IS NOT `none`. "We have not asked yet" and "we asked and
   * nothing is known" are different facts, and collapsing them is what makes
   * a screen decide something from an absence — see the ⑧ note in
   * `shift-clock-card.tsx`.
   */
  source: 'server' | 'phone' | 'none' | 'pending';
}

/**
 * The shift from the server when it answers, from the phone's copy when it
 * does not. A successful load is saved, so tomorrow's clock-in in a basement
 * still knows the member's workspaces, their boundaries and their open shift.
 */
export async function loadShift(records: RecordsStore | null, userId?: string | null): Promise<Loaded> {
  try {
    /*
      ⚠️ NO NETWORK, NO ROUND TRIP. NetInfo says nothing can reach the server,
      so the two reads below could only fail — each after a retry — before the
      phone's copy is read anyway. Go to the copy directly: the card is right in
      the first frames of a cold start in a basement, not after the failures.
    */
    if (knownOffline()) throw Object.assign(new Error('offline'), { statusCode: 0 });
    const [status, breaks] = await Promise.all([attendanceApi.getStatus(), attendanceApi.getBreakStatus()]);
    const serverAt = Date.now();
    if (records) {
      void records.upsert(SCOPE, { id: 'shift', status, breaks, serverAt } as never).catch(() => undefined);
    }
    /*
      ⚠️ AND IN A STORE THAT EXISTS. The line above is a no-op wherever the
      offline runtime did not start, which is most devices — see
      `last-shift.ts`.
    */
    keep(KEPT, userId, { status, breaks, serverAt });
    return { status, breaks, serverAt, source: 'server' };
  } catch (err) {
    if (records && isUnreachable(err)) {
      const saved = await records.get<{ status: AttendanceStatus; breaks: BreakStatus; serverAt: number }>(SCOPE, 'shift');
      if (saved) return { status: saved.data.status, breaks: saved.data.breaks, serverAt: saved.data.serverAt, source: 'phone' };
    }
    return { status: null, breaks: null, serverAt: 0, source: 'none' };
  }
}

/**
 * One reader for the shift, for every screen that shows it — the attendance
 * tab and both home cards each fetched it their own way.
 *
 * Re-reads the server whenever a shift operation is accepted, and lays
 * everything still on its way over whatever it last had.
 */
export function useShift(): ShiftView & { source: Loaded['source']; refresh: () => Promise<void> } {
  const offline = useOffline();
  const { operations } = useSyncStatus();
  const userId = useAuth().user?.id ?? null;

  /*
    ⚠️ THE FIRST RENDER IS ALREADY RIGHT, WHICH IS THE WHOLE POINT. Starting
    from `null` made the card decide a state from an ABSENCE — the ⑧ mistake
    one line up — so a member on the clock read `Ready to start` until the
    round trip finished, and a member who was not watched the clocked-in card
    go past on every refresh.

    Memory is read here, synchronously, because a promise resolves after the
    first frame is already on screen.
  */
  const [loaded, setLoaded] = useState<Loaded>(() => {
    const known = keptNow<Kept>(KEPT, userId);
    return known
      ? { status: known.status, breaks: known.breaks, serverAt: known.serverAt, source: 'phone' }
      : { status: null, breaks: null, serverAt: 0, source: 'pending' };
  });

  const refresh = useCallback(async () => {
    const next = await loadShift(offline.records, userId);
    setLoaded((prev) => {
      /*
        ⚠️ A FAILED REFRESH MUST NOT REPLACE AN ANSWER WITH AN ABSENCE. This
        runs on every focus, so one 500 or one dropped request used to blank
        the card of somebody who was on the clock a second earlier — and, by
        the ⑧ rule, could take it off the screen entirely. Knowing less than
        we did is not news.
      */
      if (next.source === 'none' && prev.source !== 'none' && prev.source !== 'pending') return prev;
      return next;
    });
  }, [offline.records, userId]);

  /* The cold start: what the LAST run of the app knew. Only ever fills a gap. */
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void keptOnDisk<Kept>(KEPT, userId).then((known) => {
      if (!alive || !known) return;
      /*
        ⚠️ `none` TOO. With no signal the refresh can finish BEFORE this read
        does — it has nothing to ask — and "nobody knows" then shut out the one
        thing the phone did know, leaving the card blank for the whole day.
      */
      setLoaded((prev) =>
        prev.source === 'pending' || prev.source === 'none'
          ? { status: known.status, breaks: known.breaks, serverAt: known.serverAt, source: 'phone' }
          : prev,
      );
    });
    return () => { alive = false; };
  }, [userId]);

  // A shift operation the server just accepted: fetch what it now says.
  const accepted = useRef(new Set<string>());
  useEffect(() => {
    let fresh = false;
    for (const o of operations) {
      if (!o.op.startsWith('attendance.') || o.state !== 'done' || accepted.current.has(o.id)) continue;
      accepted.current.add(o.id);
      fresh = true;
    }
    if (fresh) void refresh();
  }, [operations, refresh]);

  const view = useMemo(() => overlayShift(loaded, operations), [loaded, operations]);
  return { ...view, source: loaded.source, refresh };
}

/**
 * The things a member does to a shift, with or without a network.
 *
 * With the offline layer they go through the outbox; on a build without it
 * they call the API directly, as they always have. The screen gets one kind
 * of answer either way.
 */
export function useShiftActions() {
  const { engine } = useOffline();
  return useMemo(() => shiftActions(engine), [engine]);
}

async function direct(call: () => Promise<unknown>): Promise<ActionOutcome> {
  return { kind: 'done', response: await call() };
}

function shiftActions(engine: ReturnType<typeof useOffline>['engine']) {
  return {
    clockIn: (input: { locationId?: string; isRemote?: boolean; awayReason?: string; fix: OccurrenceFix }) =>
      engine
        ? clockInFromPhone(engine, input).then((r) => r.outcome)
        : direct(() =>
            attendanceApi.clockIn({
              ...(input.isRemote ? { isRemote: true } : { locationId: input.locationId }),
              lat: input.fix.lat,
              lng: input.fix.lng,
              accuracy: input.fix.accuracy,
            }),
          ),

    clockOut: (input: { entryId: string; fix?: OccurrenceFix | null; notes?: string; earlyReason?: string; overtimeReason?: string; handovers?: { taskId: string; note: string }[] }) =>
      engine
        ? clockOutFromPhone(engine, input)
        : direct(() =>
            attendanceApi.clockOut({
              ...(input.fix ? { lat: input.fix.lat, lng: input.fix.lng, accuracy: input.fix.accuracy } : {}),
              notes: input.notes,
              earlyReason: input.earlyReason,
              overtimeReason: input.overtimeReason,
              ...(input.handovers?.length ? { handovers: input.handovers } : {}),
            }),
          ),

    resolveClockOut: (input: { entryId: string; clockOutAt: Date }) =>
      engine
        ? resolveClockOutFromPhone(engine, input)
        : direct(() => attendanceApi.resolveForgotClockOut(input.entryId, input.clockOutAt.toISOString())),

    startRest: (input: { entryId: string; type?: BreakType; notes?: string; ruleId?: string }) =>
      engine
        ? startRestFromPhone(engine, input).then((r) => r.outcome)
        : direct(() => attendanceApi.startBreak(input.type, input.notes, input.ruleId)),

    endRest: (input: { entryId: string; breakId: string; notes?: string }) =>
      engine ? endRestFromPhone(engine, input) : direct(() => attendanceApi.endBreak(input.notes)),

    requestExtraTime: (input: { entryId: string }) =>
      engine ? requestExtraTimeFromPhone(engine, input) : direct(() => attendanceApi.requestExtraTime(input.entryId)),
  };
}
