/**
 * "When is everybody free?" — the next few slots in which none of the invitees is busy, on leave,
 * or outside their working day. Pure: the server gathers each person's busy intervals and working
 * days; this walks the clock.
 */
import { addDaysStr, localPartsIn, zonedWallTimeToUtc } from '../attendance/zoned-time';

export interface Busy {
  start: Date;
  end: Date;
}

export interface FreeSlotPerson {
  busy: Busy[];
  /** Is this local day a working day for them (not weekend, holiday, leave)? */
  works: (dateKey: string) => boolean;
}

export interface FreeSlotQuery {
  people: FreeSlotPerson[];
  /** Where the meeting is reckoned — the organizer's zone. */
  timezone: string;
  durationMin: number;
  /** Search from here (rounded up to the step). */
  from: Date;
  days: number;
  /** Working window, local "HH:MM". */
  dayStart?: string;
  dayEnd?: string;
  stepMin?: number;
  limit?: number;
}

export function findFreeSlots(q: FreeSlotQuery): Busy[] {
  const step = q.stepMin ?? 30;
  const limit = q.limit ?? 3;
  const [sh, sm] = (q.dayStart ?? '08:00').split(':').map(Number);
  const [eh, em] = (q.dayEnd ?? '18:00').split(':').map(Number);
  const dur = q.durationMin * 60000;
  const out: Busy[] = [];
  const startKey = localPartsIn(q.from, q.timezone).dateStr;
  for (let d = 0; d < Math.min(q.days, 60) && out.length < limit; d++) {
    const day = addDaysStr(startKey, d);
    if (!q.people.every((p) => p.works(day))) continue;
    const open = zonedWallTimeToUtc(day, sh!, sm!, q.timezone).getTime();
    const close = zonedWallTimeToUtc(day, eh!, em!, q.timezone).getTime();
    let t = Math.max(open, Math.ceil(q.from.getTime() / (step * 60000)) * step * 60000);
    for (; t + dur <= close && out.length < limit; t += step * 60000) {
      const s = t, e = t + dur;
      const clash = q.people.some((p) => p.busy.some((b) => b.start.getTime() < e && b.end.getTime() > s));
      if (!clash) {
        out.push({ start: new Date(s), end: new Date(e) });
        // Three suggestions half an hour apart are one suggestion — spread them out.
        t += Math.max(dur, 90 * 60000) - step * 60000;
      }
    }
  }
  return out;
}
