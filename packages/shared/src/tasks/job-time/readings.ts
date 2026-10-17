/** Reading job time: the live kind, an office start, the time at a moment, shifts without rests, clock minutes. */
import { toMs, type JobSpan, type JobTime, type JobTimeKind, type ShiftSpan } from './spans';

export const NO_JOB_TIME: JobTime = Object.freeze({ travel: 0, working: 0, blocked: 0 });

/**
 * The kind of time running RIGHT NOW (the last span is open to `until` and the
 * job is not paused) — what a screen may tick forward on its own between reads.
 */
export function liveJobKind(spans: readonly JobSpan[], until: Date): JobTimeKind | null {
  const last = spans[spans.length - 1];
  return last && last.end === until.getTime() ? last.kind : null;
}

/** The office's start for someone, as the history and the report state it. */
export interface OfficeStart {
  byUserId: string;
  forUserId: string;
  reason: string;
  at: string;
}

/** Longest reason kept for an office start. */
export const OFFICE_START_REASON_MAX = 300;

/** Refusal codes the screens translate. */
export const OFFICE_START_CODES = {
  /** The office moved somebody's job into work without saying why. */
  REASON_REQUIRED: 'OFFICE_START_REASON_REQUIRED',
  /** The time given is before that person clocked in, or in the future. */
  TIME_OUTSIDE_SHIFT: 'OFFICE_START_TIME_OUTSIDE_SHIFT',
} as const;

/** What GET /tasks/:id/time answers, as far as a screen's live figure needs. */
export interface JobTimeReading {
  asOf: string;
  total: JobTime;
  /** `live`: what this person's time is running as now (their own stop makes it `blocked`), null when not counting. */
  byWorker: ReadonlyArray<JobTime & { user: { id: string }; live?: JobTimeKind | null }>;
  live: { kind: JobTimeKind } | null;
}

/**
 * What a job's time reads RIGHT NOW on a screen. The server worked it out at
 * `asOf`; between reads the running kind moves forward by the minutes since,
 * only while somebody credited is on the clock (`live`). A worker reads their
 * OWN share (`meId`) — Mike's time stays Mike's — anybody else the job's total.
 */
export function jobTimeAt(
  reading: JobTimeReading | null | undefined,
  meId: string | null | undefined,
  now: number,
): (JobTime & { live: JobTimeKind | null }) | null {
  if (!reading) return null;
  const minutes = Math.max(0, Math.floor((now - new Date(reading.asOf).getTime()) / 60_000));
  const mine = meId ? reading.byWorker.find((w) => w.user.id === meId) : undefined;
  const perPerson = reading.byWorker.some((w) => w.live !== undefined);
  if (mine) {
    const base: JobTime = { travel: mine.travel, working: mine.working, blocked: mine.blocked };
    const live = mine.live !== undefined ? mine.live : (reading.live?.kind ?? null);
    if (live) base[live] += minutes;
    return { ...base, live };
  }
  const base: JobTime = { ...reading.total };
  if (perPerson) {
    // The job's total runs once per person counting now — a crew of three adds three minutes a minute.
    for (const w of reading.byWorker) if (w.live) base[w.live] += minutes;
    return { ...base, live: reading.live?.kind ?? null };
  }
  const live = reading.live && (!meId || reading.byWorker.length === 0) ? reading.live.kind : null;
  if (live) base[live] += minutes;
  return { ...base, live };
}

/**
 * A shift as job time sees it: on the clock, minus its rests. A rest taken in
 * the middle of a job is not time on that job — and the "worked" figure set
 * against job time is measured on the very same spans, so the one can never
 * exceed the other. An open shift or rest runs to `until`.
 */
export function shiftsWithoutRests(
  shifts: ReadonlyArray<{
    start: Date | string;
    end: Date | string | null;
    rests?: ReadonlyArray<{ start: Date | string; end: Date | string | null }>;
  }>,
  until: Date,
): ShiftSpan[] {
  const cap = until.getTime();
  const out: ShiftSpan[] = [];
  for (const s of shifts) {
    const a = toMs(s.start);
    const b = Math.min(s.end == null ? cap : toMs(s.end), cap);
    if (!(b > a)) continue;
    const rests = (s.rests ?? [])
      .map((r) => [Math.max(toMs(r.start), a), Math.min(r.end == null ? cap : toMs(r.end), b)] as [number, number])
      .filter(([x, y]) => y > x)
      .sort((p, q) => p[0] - q[0]);
    let at = a;
    for (const [x, y] of rests) {
      if (x > at) out.push({ start: new Date(at), end: new Date(x) });
      at = Math.max(at, y);
    }
    if (b > at) out.push({ start: new Date(at), end: new Date(b) });
  }
  return out;
}

/** Minutes on the clock inside [from, to], from spans already free of rests. */
export function clockMinutes(spans: readonly ShiftSpan[], from: Date, to: Date): number {
  const lo = from.getTime();
  const hi = to.getTime();
  let ms = 0;
  for (const s of spans) {
    const a = Math.max(toMs(s.start), lo);
    const b = Math.min(s.end == null ? hi : toMs(s.end), hi);
    if (b > a) ms += b - a;
  }
  return Math.round(ms / 60_000);
}
