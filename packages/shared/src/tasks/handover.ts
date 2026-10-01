/**
 * Paused at clock-out, and the handover note — ONE rule for the server, the
 * phone and the web.
 *
 * A worker who clocked out with a job in a working step left it "running" with
 * nobody on it: its time kept counting overnight, and whoever was given it next
 * knew nothing of what had been done. Now:
 *
 *   - the clock-out PAUSES every job the worker has in a working step, at the
 *     clock-out minute. A flag on the job (`pausedAt`), never a status: the
 *     workflow is the organization's own and need not have a step for it;
 *   - the worker says what they did and what is left — in the clock-out sheet,
 *     or later. Until they do, the job carries "no handover yet" and the phone
 *     asks on every open. ⚠️ It never BLOCKS anything: not the clock-out (a dead
 *     phone, an automatic close), not the next clock-in, not a reassignment;
 *   - "Resume work" clears the pause, and is a move into work, so the clock gate
 *     (clock-gate.ts) applies to it. Any move of the job clears it too.
 */

/** Longest note kept. A handover is a paragraph, not a report. */
export const HANDOVER_NOTE_MAX = 2000;

/** At most this many photos on one note. */
export const HANDOVER_PHOTOS_MAX = 6;

/** Refusal codes the screens translate. */
export const HANDOVER_CODES = {
  /** Only somebody on the job (or who owes the note) writes its handover. */
  NOT_ON_THE_JOB: 'HANDOVER_NOT_ON_THE_JOB',
  /** "Resume" on a job that is no longer paused. */
  NOT_PAUSED: 'JOB_NOT_PAUSED',
} as const;

/** One entry of a job's history, as far as working time is concerned. */
export interface WorkTimelineEvent {
  at: Date | string;
  userId: string;
  kind: 'STATUS' | 'PAUSED' | 'RESUMED';
  /** For STATUS: the step moved into. */
  status?: string;
}

/** A stretch the worker was on the clock. `end` null = still clocked in. */
export interface ShiftSpan {
  start: Date | string;
  end: Date | string | null;
}

/**
 * How long somebody worked on a job, in whole minutes, up to `until`.
 *
 * Counted from their own first move on it — a crew member who joins later is
 * not credited with the morning — over the time the job was in a working step
 * (`isWorkingStep`, the clock gate's own rule) and not paused. Blocked, waiting
 * and paused time are not work.
 *
 * ⚠️ With `shifts`, only time ON THE CLOCK counts. A job left "in progress"
 * before pausing existed would otherwise claim every night and weekend since —
 * one real job read "worked 2588h". The job's time and the timesheet must tell
 * the same story; this is where they are made to.
 */
export function workedMinutesOnJob(
  events: readonly WorkTimelineEvent[],
  workerId: string,
  until: Date,
  isWorkingStep: (status: string) => boolean,
  shifts?: readonly ShiftSpan[],
): number {
  const sorted = [...events]
    .map((e) => ({ ...e, t: new Date(e.at).getTime() }))
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t);
  const firstOwn = sorted.find((e) => e.userId === workerId);
  if (!firstOwn) return 0;

  const end = until.getTime();
  let working = false;
  let paused = false;
  let since = firstOwn.t;
  const spans: Array<[number, number]> = [];
  for (const e of sorted) {
    if (e.t > end) break;
    // From their first move on, each stretch counts if the job was in work.
    if (e.t >= firstOwn.t) {
      if (working && !paused && e.t > since) spans.push([since, e.t]);
      since = e.t;
    }
    if (e.kind === 'STATUS') { working = isWorkingStep(e.status ?? ''); paused = false; }
    else paused = e.kind === 'PAUSED';
  }
  if (working && !paused && end > since) spans.push([since, end]);

  const clock = shifts?.map((x) => [new Date(x.start).getTime(), x.end == null ? end : Math.min(new Date(x.end).getTime(), end)] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
  let total = 0;
  for (const [a, b] of spans) {
    if (!clock) { total += b - a; continue; }
    for (const [c, d] of clock) total += Math.max(0, Math.min(b, d) - Math.max(a, c));
  }
  return Math.max(0, Math.round(total / 60_000));
}

/** What a screen needs to know about a job's pause. */
export interface JobPauseFacts {
  pausedAt?: string | Date | null;
  pausedById?: string | null;
  handoverDueById?: string | null;
}

export function isJobPaused(task: JobPauseFacts | null | undefined): boolean {
  return !!task?.pausedAt;
}

/** Does THIS person still owe the job's handover note? */
export function owesHandover(task: JobPauseFacts | null | undefined, userId: string | null | undefined): boolean {
  return !!userId && task?.handoverDueById === userId;
}

/** Trim and cap a note; empty → null (nothing was written). */
export function cleanHandoverNote(note: unknown): string | null {
  if (typeof note !== 'string') return null;
  const t = note.trim();
  return t ? t.slice(0, HANDOVER_NOTE_MAX) : null;
}
