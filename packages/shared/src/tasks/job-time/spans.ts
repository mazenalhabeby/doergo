/** A job's history turned into spans of each kind of time, per job and per person. */
import { stepStartsWork } from '../clock-gate';

/**
 * Job time — ONE rule for the job page, the handover, the clock-out sheet and
 * the report.
 *
 * Worked out from the moments already saved for every step (no running timer,
 * nothing in the background), and split three ways:
 *
 *   travel  — on the way: a working step whose only tools are the route (`gps`)
 *             and the clock (`timer`) — EN_ROUTE, IN_TRANSIT, any custom twin;
 *   working — every other working step (the clock gate's own rule);
 *   blocked — reported an issue, until it is resumed.
 *
 * ⚠️ ONLY INSIDE A SHIFT. Each worker's share is clipped to the time they were
 * clocked in, so job time never runs overnight and can never be more than the
 * time on the timesheet: billed hours and worked hours come from the same
 * moments. A paused job (clock-out) counts nothing until it is picked up.
 *
 * ⚠️ PER PERSON. A worker is credited from their own first move on the job —
 * or the office's move made FOR them — so whoever takes a job over starts at
 * their own Start work, and the time before stays the previous worker's.
 */

export type JobTimeKind = 'travel' | 'working' | 'blocked';

export interface JobTime {
  travel: number;
  working: number;
  blocked: number;
}

/** One entry of a job's history, as far as its time is concerned. */
export interface WorkTimelineEvent {
  at: Date | string;
  /** Who made the move. */
  userId: string;
  /**
   * LEFT: `userId` was taken off the job, or left it (unassigned, removed,
   * their own Leave, their clock-out, another job).
   * JOINED / SELF_BLOCKED / SELF_RESUMED are about ONE person (crew.ts): they
   * change who is credited and how, never the job's own line.
   */
  kind: 'STATUS' | 'PAUSED' | 'RESUMED' | 'LEFT' | 'JOINED' | 'SELF_BLOCKED' | 'SELF_RESUMED';
  /** For STATUS: the step moved into. */
  status?: string;
  /** The office moved it FOR this person — it counts as their move. */
  forUserId?: string | null;
  /** SELF_BLOCKED: what stopped them (shown on the crew panel). */
  reason?: string | null;
}

/** A stretch the worker was on the clock. `end` null = still clocked in. */
export interface ShiftSpan {
  start: Date | string;
  end: Date | string | null;
}

/** A stretch of the job in one kind of time, in epoch ms. */
export interface JobSpan {
  start: number;
  end: number;
  kind: JobTimeKind;
}

const BLOCKED_KEYS = new Set(['BLOCKED']);

/** One person's own moves — they never change what the job is doing. */
const PERSONAL = new Set<WorkTimelineEvent['kind']>(['LEFT', 'JOINED', 'SELF_BLOCKED', 'SELF_RESUMED']);

const ROUTE_ONLY = new Set(['gps', 'timer']);

/** Which kind of time a step is, or null when time there is not job time (accepted, done, waiting). */
export function stepTimeKind(statusKey: string, capabilities: readonly string[]): JobTimeKind | null {
  if (BLOCKED_KEYS.has(statusKey)) return 'blocked';
  if (!stepStartsWork(statusKey, capabilities)) return null;
  return capabilities.includes('gps') && capabilities.every((c) => ROUTE_ONLY.has(c)) ? 'travel' : 'working';
}

const toMs = (v: Date | string) => new Date(v).getTime();

function sortedEvents(events: readonly WorkTimelineEvent[]) {
  return [...events]
    .map((e) => ({ ...e, t: toMs(e.at) }))
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t);
}

/**
 * The job's own time line: each stretch it spent travelling, working or blocked,
 * up to `until`. Paused stretches are left out.
 */
export function jobSpans(
  events: readonly WorkTimelineEvent[],
  until: Date,
  kindOf: (status: string) => JobTimeKind | null,
): JobSpan[] {
  const end = until.getTime();
  const spans: JobSpan[] = [];
  let kind: JobTimeKind | null = null;
  let paused = false;
  let since = 0;
  for (const e of sortedEvents(events)) {
    if (e.t > end) break;
    // Somebody joining, leaving or stopping on their own changes who is credited, not what the job is doing.
    if (PERSONAL.has(e.kind)) continue;
    if (kind && !paused && e.t > since) spans.push({ start: since, end: e.t, kind });
    since = e.t;
    if (e.kind === 'STATUS') {
      kind = kindOf(e.status ?? '');
      paused = false;
    } else paused = e.kind === 'PAUSED';
  }
  if (kind && !paused && end > since) spans.push({ start: since, end, kind });
  return spans;
}

/** When this person joined the job: their first move on it, or the office's move for them. */
export function joinedJobAt(events: readonly WorkTimelineEvent[], workerId: string): number | null {
  const first = sortedEvents(events).find(
    (e) =>
      e.kind !== 'LEFT' && e.kind !== 'SELF_RESUMED' && e.kind !== 'PAUSED' && (e.forUserId ?? e.userId) === workerId,
  );
  return first ? first.t : null;
}

/**
 * The stretches a person was ON the job: from their own move (or the office's
 * move for them) until they are taken off it — and again from their next move,
 * if they are put back. A worker the job was handed away from stops being
 * credited at the hand-over, however long they stay clocked in.
 */
export function jobWindows(events: readonly WorkTimelineEvent[], workerId: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let since: number | null = null;
  for (const e of sortedEvents(events)) {
    if (e.kind === 'LEFT') {
      if (e.userId === workerId && since != null) {
        out.push([since, e.t]);
        since = null;
      }
      continue;
    }
    // Pausing a job (a clock-out) or resuming one's own stop is not a way onto it.
    if (e.kind === 'SELF_RESUMED' || e.kind === 'PAUSED') continue;
    if (since == null && (e.forUserId ?? e.userId) === workerId) since = e.t;
  }
  if (since != null) out.push([since, Infinity]);
  return out;
}

/**
 * When this person had stopped on their own ("My issue"): from their
 * SELF_BLOCKED to their SELF_RESUMED, or to their leaving the job.
 */
export function selfBlockWindows(events: readonly WorkTimelineEvent[], workerId: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let since: number | null = null;
  for (const e of sortedEvents(events)) {
    if (e.userId !== workerId) continue;
    if (e.kind === 'SELF_BLOCKED' && since == null) since = e.t;
    else if ((e.kind === 'SELF_RESUMED' || e.kind === 'LEFT') && since != null) {
      out.push([since, e.t]);
      since = null;
    }
  }
  if (since != null) out.push([since, Infinity]);
  return out;
}

/**
 * One person's spans with their OWN stops applied: inside a self-block every
 * moment is `blocked` for them, whatever the job is doing — the crew carries
 * on working, one person waits for a part.
 */
export function personalSpans(spans: readonly JobSpan[], selfBlocks: ReadonlyArray<[number, number]>): JobSpan[] {
  if (!selfBlocks.length) return [...spans];
  const out: JobSpan[] = [];
  const push = (sp: JobSpan) => {
    if (sp.end <= sp.start) return;
    const last = out[out.length - 1];
    if (last && last.end === sp.start && last.kind === sp.kind) last.end = sp.end;
    else out.push({ ...sp });
  };
  for (const sp of spans) {
    let cursor = sp.start;
    for (const [b0, b1] of selfBlocks) {
      if (b1 <= cursor || b0 >= sp.end) continue;
      push({ start: cursor, end: Math.max(cursor, b0), kind: sp.kind });
      push({ start: Math.max(cursor, b0), end: Math.min(sp.end, b1), kind: 'blocked' });
      cursor = Math.min(sp.end, b1);
    }
    push({ start: cursor, end: sp.end, kind: sp.kind });
  }
  return out;
}

/**
 * One person's share of the job's spans, in whole minutes: from when they
 * joined, inside their shifts, inside [from, to] when a window is asked for.
 */
export function workerJobTime(
  spans: readonly JobSpan[],
  joinedAt: number | null,
  shifts: readonly ShiftSpan[] | null,
  window: { from?: Date; to?: Date } = {},
): JobTime {
  const out: JobTime = { travel: 0, working: 0, blocked: 0 };
  if (joinedAt == null) return out;
  const lo = Math.max(joinedAt, window.from ? window.from.getTime() : -Infinity);
  const hi = window.to ? window.to.getTime() : Infinity;
  const clock = shifts
    ?.map((s) => [toMs(s.start), s.end == null ? Infinity : toMs(s.end)] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && b > a);
  for (const sp of spans) {
    const a = Math.max(sp.start, lo);
    const b = Math.min(sp.end, hi);
    if (b <= a) continue;
    if (!clock) {
      out[sp.kind] += b - a;
      continue;
    }
    for (const [c, d] of clock) out[sp.kind] += Math.max(0, Math.min(b, d) - Math.max(a, c));
  }
  return {
    travel: Math.round(out.travel / 60_000),
    working: Math.round(out.working / 60_000),
    blocked: Math.round(out.blocked / 60_000),
  };
}

/**
 * ONE PERSON, ONE JOB AT A TIME. Two jobs left "in progress" at once would
 * each claim the same shift, and job time would exceed the clock — the one
 * thing it must never do. Where a person's jobs overlap, each moment goes to
 * the job they moved most recently (the latest span to start), the same rule
 * as "one job at a time" on the phone.
 *
 * Input: each job's spans and when the person joined it. Output: each job's
 * spans with the overlaps given away, already clipped to the join.
 */
export function exclusiveSpans(
  jobs: ReadonlyArray<{
    id: string;
    spans: readonly JobSpan[];
    joinedAt?: number | null;
    windows?: ReadonlyArray<[number, number]>;
  }>,
): Map<string, JobSpan[]> {
  type Piece = JobSpan & { id: string; rank: number };
  const all: Piece[] = [];
  for (const j of jobs) {
    // The stretches the person was on this job (jobWindows), or from when they joined.
    const windows = j.windows ?? (j.joinedAt == null ? [] : [[j.joinedAt, Infinity] as [number, number]]);
    for (const sp of j.spans) {
      for (const [w0, w1] of windows) {
        const start = Math.max(sp.start, w0);
        const end = Math.min(sp.end, w1);
        // Ranked by the span's OWN start: "moved most recently" is about the job, not the window.
        if (end > start) all.push({ ...sp, start, end, id: j.id, rank: sp.start });
      }
    }
  }
  const out = new Map<string, JobSpan[]>(jobs.map((j) => [j.id, []]));
  if (!all.length) return out;
  const bounds = [...new Set(all.flatMap((p) => [p.start, p.end]))].sort((a, b) => a - b);
  const byStart = [...all].sort((a, b) => a.start - b.start);
  let next = 0;
  let active: Piece[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i]!;
    const hi = bounds[i + 1]!;
    while (next < byStart.length && byStart[next]!.start <= lo) active.push(byStart[next++]!);
    active = active.filter((p) => p.end > lo);
    if (!active.length) continue;
    // The most recently entered wins the moment.
    const win = active.reduce((w, p) => (p.rank > w.rank ? p : w));
    const list = out.get(win.id)!;
    const last = list[list.length - 1];
    if (last && last.end === lo && last.kind === win.kind) last.end = hi;
    else list.push({ start: lo, end: hi, kind: win.kind });
  }
  return out;
}

export function addJobTime(a: JobTime, b: JobTime): JobTime {
  return { travel: a.travel + b.travel, working: a.working + b.working, blocked: a.blocked + b.blocked };
}

export { toMs };
