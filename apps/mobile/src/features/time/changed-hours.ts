import { personName } from '@hbcfield/shared/client';
import type { TimeOffRequest } from '@/lib/api';

/*
  Hours changed for TODAY (docs/plans/time-counting-model.md, phase 2): an approved changed-hours
  request — the office set them, or the member asked and a leader agreed. The clock already counts
  them (the server applies the request at clock-in); this only says so on the Time page, with who.
*/

export interface ChangedHoursToday {
  start: string | null;
  end: string | null;
  /** The end is on the next morning (a night). */
  night: boolean;
  by: string | null;
  reason: string | null;
}

export function changedHoursToday(requests: readonly TimeOffRequest[], todayKey: string): ChangedHoursToday | null {
  const r = requests.find(
    (x) =>
      x.kind === 'HOURS' &&
      x.status === 'APPROVED' &&
      x.startDate.slice(0, 10) <= todayKey &&
      x.endDate.slice(0, 10) >= todayKey &&
      (x.startTime || x.endTime),
  );
  if (!r) return null;
  return {
    start: r.startTime ?? null,
    end: r.endTime ?? null,
    night: !!(r.startTime && r.endTime && r.endTime <= r.startTime),
    by: r.approvedBy ? personName(r.approvedBy) : null,
    reason: r.reason ?? null,
  };
}
