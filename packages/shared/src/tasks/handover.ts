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

import {
  exclusiveSpans,
  joinedJobAt,
  jobSpans,
  jobWindows,
  workerJobTime,
  type JobTimeKind,
  type ShiftSpan,
  type WorkTimelineEvent,
} from './job-time';

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

/**
 * How long somebody WORKED on a job (travel and blocked time apart), in whole
 * minutes, up to `until` — the figure the handover and the reassign warning
 * quote. The general rule, and why only time on the clock counts: job-time.ts.
 */
export function workedMinutesOnJob(
  events: readonly WorkTimelineEvent[],
  workerId: string,
  until: Date,
  kindOf: (status: string) => JobTimeKind | null,
  shifts?: readonly ShiftSpan[],
): number {
  const mine =
    exclusiveSpans([{ id: 'job', spans: jobSpans(events, until, kindOf), windows: jobWindows(events, workerId) }]).get(
      'job',
    ) ?? [];
  return workerJobTime(mine, joinedJobAt(events, workerId) == null ? null : -Infinity, shifts ?? null).working;
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
