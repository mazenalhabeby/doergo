import type { AttendanceStatus, BreakStatus } from '@hbcfield/shared/client';
import { attendanceApi } from '@/lib/api/attendance';
import type { RecordsStore } from '../db/records-store';
import { keep } from '@/lib/remember/store';
import { isUnreachable } from '../actions/unreachable';
import { knownOffline } from '../connectivity';

/*
  The shift's one READ, with no React in it — the screens (`use-shift.ts`) and
  the automatic clock's background task (services/auto-clock) both call it, and
  a task woken by the OS has no React tree to ask.
*/

export const SHIFT_SCOPE = 'attendance';
/** ⚠️ One question per name — see `lib/remember/store.ts`. */
const KEPT = 'shift';
export { KEPT as KEPT_SHIFT };

/** What is remembered between runs — see `lib/remember/store.ts`. */
export interface KeptShift {
  status: AttendanceStatus | null;
  breaks: BreakStatus | null;
  serverAt: number;
}

export interface LoadedShift {
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
export async function loadShift(records: RecordsStore | null, userId?: string | null): Promise<LoadedShift> {
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
      void records.upsert(SHIFT_SCOPE, { id: 'shift', status, breaks, serverAt } as never).catch(() => undefined);
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
      const saved = await records.get<{ status: AttendanceStatus; breaks: BreakStatus; serverAt: number }>(SHIFT_SCOPE, 'shift');
      if (saved) return { status: saved.data.status, breaks: saved.data.breaks, serverAt: saved.data.serverAt, source: 'phone' };
    }
    return { status: null, breaks: null, serverAt: 0, source: 'none' };
  }
}
