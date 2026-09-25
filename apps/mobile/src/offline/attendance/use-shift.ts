import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AttendanceStatus, BreakStatus, BreakType, OccurrenceFix } from '@hbcfield/shared/client';
import { attendanceApi } from '../../lib/api/attendance';
import type { ActionOutcome } from '../actions/outcome';
import type { RecordsStore } from '../db/records-store';
import { useOffline, useSyncStatus } from '../offline-context';
import { isUnreachable } from '../actions/unreachable';
import { overlayShift, type ShiftView } from './shift-overlay';
import { clockInFromPhone, clockOutFromPhone, endRestFromPhone, requestExtraTimeFromPhone, resolveClockOutFromPhone, startRestFromPhone } from './shift-actions';

const SCOPE = 'attendance';

interface Loaded {
  status: AttendanceStatus | null;
  breaks: BreakStatus | null;
  /** When the server answered (epoch ms); 0 when this came from the phone. */
  serverAt: number;
  /**
   * ⚠️ `pending` IS NOT `none`. "We have not asked yet" and "we asked and
   * nothing is known" are different facts, and collapsing them is what makes
   * a screen decide something from an absence — see `SAVED_GOOD_FOR` below
   * and the ⑧ note in `shift-clock-card.tsx`.
   */
  source: 'server' | 'phone' | 'none' | 'pending';
}

/**
 * How long the phone's own copy is worth painting before the server answers.
 *
 * ⚠️ LONGER THAN ANY SHIFT, SHORTER THAN A HABIT. The copy is there to stop
 * the card guessing while the request is in flight; a week-old one would put
 * `ON THE CLOCK` and a running hero in front of somebody who is not working,
 * which is the same lie as the flash, held longer.
 */
const SAVED_GOOD_FOR = 18 * 60 * 60 * 1000;

/**
 * The shift from the server when it answers, from the phone's copy when it
 * does not. A successful load is saved, so tomorrow's clock-in in a basement
 * still knows the member's workspaces, their boundaries and their open shift.
 */
export async function loadShift(records: RecordsStore | null): Promise<Loaded> {
  try {
    const [status, breaks] = await Promise.all([attendanceApi.getStatus(), attendanceApi.getBreakStatus()]);
    const serverAt = Date.now();
    if (records) {
      void records.upsert(SCOPE, { id: 'shift', status, breaks, serverAt } as never).catch(() => undefined);
    }
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
  const [loaded, setLoaded] = useState<Loaded>({ status: null, breaks: null, serverAt: 0, source: 'pending' });

  const refresh = useCallback(async () => {
    const next = await loadShift(offline.records);
    setLoaded((prev) => {
      /*
        ⚠️ A FAILED REFRESH MUST NOT REPLACE AN ANSWER WITH AN ABSENCE. This
        runs on every focus, so one 500 or one dropped request used to blank
        the card of somebody who was on the clock a second earlier — and, by
        the ⑧ rule, could remove it from the screen entirely. Knowing less
        than we did is not news; the previous answer stands until a better one
        arrives.
      */
      if (next.source === 'none' && prev.source !== 'none' && prev.source !== 'pending') return prev;
      return next;
    });
  }, [offline.records]);

  /*
    ⚠️ PAINT WHAT THE PHONE ALREADY KNOWS, AT ONCE.

    The saved copy used to be read ONLY when the request failed and the
    network was unreachable — so on an ordinary launch, with the answer
    sitting in the phone's own database, the card rendered from `null` first.
    It then decided a state from that absence: a member on the clock saw
    `Ready to start` for as long as the round trip took, and a member who was
    not saw the clocked-in card flash past on every refresh. The right answer
    was on the device the whole time.

    The server still replaces it the moment it answers, and a server answer
    that gets in first is never overwritten by the slower disk read.
  */
  useEffect(() => {
    const records = offline.records;
    if (!records) return;
    let alive = true;
    void records
      .get<{ status: AttendanceStatus; breaks: BreakStatus; serverAt: number }>(SCOPE, 'shift')
      .then((saved) => {
        if (!alive || !saved) return;
        if (Date.now() - saved.data.serverAt > SAVED_GOOD_FOR) return;
        setLoaded((prev) =>
          /* Only ever fills a gap — it never argues with a real answer. */
          prev.source === 'pending'
            ? { status: saved.data.status, breaks: saved.data.breaks, serverAt: saved.data.serverAt, source: 'phone' }
            : prev,
        );
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [offline.records]);

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

    clockOut: (input: { entryId: string; fix?: OccurrenceFix | null; notes?: string; earlyReason?: string; overtimeReason?: string }) =>
      engine
        ? clockOutFromPhone(engine, input)
        : direct(() =>
            attendanceApi.clockOut({
              ...(input.fix ? { lat: input.fix.lat, lng: input.fix.lng, accuracy: input.fix.accuracy } : {}),
              notes: input.notes,
              earlyReason: input.earlyReason,
              overtimeReason: input.overtimeReason,
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
