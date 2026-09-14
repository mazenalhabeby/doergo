import type { AttendanceStatus, Break, BreakStatus, CompanyLocation, TimeEntry } from '@hbcfield/shared/client';
import { STILL_MINE } from '../actions/outcome';
import type { OutboxOp } from '../outbox/types';

export const ATTENDANCE_OPS: ReadonlySet<string> = new Set([
  'attendance.clockIn',
  'attendance.clockOut',
  'attendance.breakStart',
  'attendance.breakEnd',
]);

export type PendingEntry = TimeEntry & { pendingSync?: boolean };

export interface ShiftView {
  status: (AttendanceStatus & { currentEntry: PendingEntry | null }) | null;
  breaks: BreakStatus | null;
  /** Something about the shift has not reached the server yet. */
  pendingSync: boolean;
}

type Body = Record<string, unknown> & { evidence?: { occurredAt?: string } };

/**
 * The shift as the member sees it: the server's last answer with their own
 * clock-ins, clock-outs and rests laid on top, in the order they tapped them.
 *
 * Computed on every read and never stored, like the task overlay — a refused
 * clock-in disappears from the screen the moment it is refused.
 *
 * ⚠️ An operation the server accepted AFTER `serverAt` still counts: between
 * "sent" and the next refresh, the cached status is older than the operation,
 * and dropping it would flash "not clocked in" at somebody who just clocked in.
 */
export function overlayShift(
  server: { status: AttendanceStatus | null; breaks: BreakStatus | null; serverAt: number },
  ops: readonly OutboxOp[],
): ShiftView {
  let status = server.status ? { ...server.status } : null;
  let breaks = server.breaks ? { ...server.breaks } : null;
  let pendingSync = false;

  const relevant = ops
    .filter((o) => ATTENDANCE_OPS.has(o.op) && (STILL_MINE.has(o.state) || (o.state === 'done' && o.updatedAt > server.serverAt)))
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const op of relevant) {
    const body = (op.payload.body ?? {}) as Body;
    const at = body.evidence?.occurredAt ?? new Date(op.createdAt).toISOString();
    if (STILL_MINE.has(op.state)) pendingSync = true;

    switch (op.op) {
      case 'attendance.clockIn': {
        const locations: CompanyLocation[] = status?.assignedLocations ?? [];
        const location = locations.find((l) => l.id === body.locationId) ?? null;
        const entry = {
          id: String(body.id),
          locationId: (body.locationId as string) ?? location?.id ?? '',
          location,
          status: 'CLOCKED_IN',
          clockInAt: at,
          clockOutAt: null,
          isRemote: !!body.isRemote,
          breakMinutes: 0,
          pendingSync: STILL_MINE.has(op.state),
        } as unknown as PendingEntry;
        status = { ...(status ?? { assignedLocations: [] }), isClockedIn: true, currentEntry: entry } as ShiftView['status'];
        breaks = { isClockedIn: true, isOnBreak: false, currentBreak: null, todayBreaks: breaks?.todayBreaks ?? [], totalBreakMinutes: breaks?.totalBreakMinutes ?? 0 };
        break;
      }
      case 'attendance.clockOut': {
        if (status && (!status.currentEntry || status.currentEntry.id === body.entryId)) {
          status = { ...status, isClockedIn: false, currentEntry: null, activeExcursion: null };
        }
        if (breaks) breaks = { ...breaks, isClockedIn: false, isOnBreak: false, currentBreak: null };
        break;
      }
      case 'attendance.breakStart': {
        const current = {
          id: String(body.id),
          timeEntryId: String(body.entryId ?? status?.currentEntry?.id ?? ''),
          type: (body.type as Break['type']) ?? 'SHORT',
          startedAt: at,
          endedAt: null,
          durationMinutes: null,
          notes: (body.notes as string) ?? null,
        } as Break;
        breaks = { ...(breaks ?? { todayBreaks: [], totalBreakMinutes: 0 }), isClockedIn: true, isOnBreak: true, currentBreak: current };
        break;
      }
      case 'attendance.breakEnd': {
        if (!breaks?.currentBreak) break;
        const minutes = Math.max(0, Math.round((Date.parse(at) - Date.parse(breaks.currentBreak.startedAt)) / 60_000));
        const ended = { ...breaks.currentBreak, endedAt: at, durationMinutes: minutes };
        breaks = {
          ...breaks,
          isOnBreak: false,
          currentBreak: null,
          todayBreaks: [...breaks.todayBreaks.filter((b) => b.id !== ended.id), ended],
          totalBreakMinutes: breaks.totalBreakMinutes + minutes,
        };
        break;
      }
    }
  }
  return { status: status as ShiftView['status'], breaks, pendingSync };
}

/** The open clock-in (or break start) an operation must wait for, if it has not been accepted yet. */
export function openOpFor(ops: readonly OutboxOp[], op: OutboxOp['op'], match: (body: Body) => boolean): OutboxOp | undefined {
  return ops.find((o) => o.op === op && STILL_MINE.has(o.state) && match((o.payload.body ?? {}) as Body));
}
