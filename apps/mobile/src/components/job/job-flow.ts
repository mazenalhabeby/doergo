import type { FlowStatus } from '@hbcfield/shared/client';
import type { TaskEvent } from '../../lib/api/types';

/**
 * THE JOB, STEP BY STEP — `docs/design/job-step.html`.
 *
 * ⚠️ NEVER A NAME. Every widget comes from a capability and every action from
 * a transition. The workflow reference §04 lists seven behaviours keyed to
 * English step names; nothing in this file reads a step's key for meaning, so
 * a workflow whose step is called "On the road" behaves exactly like one
 * called EN_ROUTE.
 */

export type Cap = 'gps' | 'timer' | 'checklist' | 'photos' | 'signature' | 'report' | 'form';

export const has = (s: FlowStatus | null | undefined, c: Cap): boolean =>
  !!s && ((s as FlowStatus & { capabilities?: string[] }).capabilities ?? []).includes(c);

/** The rail: the workflow's own steps, in order, without the cancel step. */
export function railOf(steps: FlowStatus[]): FlowStatus[] {
  return steps.filter((s) => !s.isCanceled).sort((a, b) => a.position - b.position);
}

/** The step before `current` on the rail, if any. */
export function previousOf(steps: FlowStatus[], current: FlowStatus): FlowStatus | null {
  const rail = railOf(steps);
  const i = rail.findIndex((s) => s.key === current.key);
  return i > 0 ? rail[i - 1]! : null;
}

/** A cancel step this one can move to — which is what makes Decline possible. */
export function declineTarget(steps: FlowStatus[], current: FlowStatus): FlowStatus | null {
  return current.transitions.map((k) => steps.find((s) => s.key === k)).find((s) => !!s?.isCanceled) ?? null;
}

export type VerbKind = 'drive' | 'arrive' | 'start' | 'finish' | 'next';

/**
 * What the next step MEANS, read off the two steps' capabilities:
 *
 *   into a gps step            → you are setting off        "Start driving"
 *   out of a gps step          → you are there               "I've arrived"
 *   into the first timer step  → the work starts             "Start work"
 *   into a finished step       → the job ends                "Finish the job"
 *   anything else              → the step's own name         "Next: Triaging"
 *
 * ⚠️ The button label is the transition, never a hardcoded ladder of five.
 */
export function verbKind(current: FlowStatus, target: FlowStatus): VerbKind {
  if (target.isFinal) return 'finish';
  if (has(target, 'gps') && !has(current, 'gps')) return 'drive';
  if (has(current, 'gps') && !has(target, 'gps')) return 'arrive';
  if (has(target, 'timer') && !has(current, 'timer')) return 'start';
  return 'next';
}

/** The secondary button beside More: Navigate while travel is part of this step or the next. */
export function travelling(current: FlowStatus, next: FlowStatus | null): boolean {
  return has(current, 'gps') || has(next, 'gps');
}

export type Tone = 'accent' | 'warn' | 'critical';

/**
 * ⚠️ TONE FROM MEANING, NOT FROM `FlowStatus.color`. Jade while it is going to
 * plan, warn when something needs a person, critical only when it is blocked.
 * Three tones, not one per step.
 */
export function toneOf(status: string, daysLate: number): Tone {
  if (status === 'BLOCKED') return 'critical';
  if (daysLate > 0) return 'warn';
  return 'accent';
}

/** When a status change landed, from a timeline event. */
function changeAt(e: TaskEvent): { to: string; at: number } | null {
  if (e.eventType !== 'STATUS_CHANGED') return null;
  const m = (e.metadata ?? {}) as { newStatus?: string; occurredAt?: string };
  if (!m.newStatus) return null;
  const at = Date.parse(m.occurredAt ?? e.createdAt);
  return Number.isFinite(at) ? { to: m.newStatus, at } : null;
}

/**
 * ⚠️ THE TIMER RUNS FROM THE FIRST STEP WHERE `timer` IS ON — NEVER FROM
 * CREATION. The live screen showed "150d 1h 37m" because it counted from when
 * the job was made, and printed that on the service report a customer signs.
 * `null` when the timeline does not say — no figure beats a wrong one.
 */
export function timerStart(events: TaskEvent[], steps: FlowStatus[]): number | null {
  const timed = new Set(steps.filter((s) => has(s, 'timer')).map((s) => s.key));
  const hits = events.map(changeAt).filter((x): x is { to: string; at: number } => !!x && timed.has(x.to));
  return hits.length ? Math.min(...hits.map((h) => h.at)) : null;
}

/** When the member entered the step they are on now. */
export function enteredAt(events: TaskEvent[], status: string): number | null {
  const hits = events.map(changeAt).filter((x): x is { to: string; at: number } => !!x && x.to === status);
  return hits.length ? Math.max(...hits.map((h) => h.at)) : null;
}

/** `2h 41m`, `11m`. */
export function spanText(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/**
 * The reasons on "Something is wrong" — six, one tap. Severity is the office's
 * triage hint, not the member's verdict.
 */
export const WRONG_REASONS = [
  { key: 'parts', severity: 'MEDIUM' },
  { key: 'access', severity: 'HIGH' },
  { key: 'customer', severity: 'MEDIUM' },
  { key: 'unsafe', severity: 'URGENT' },
  { key: 'wrongJob', severity: 'MEDIUM' },
  { key: 'other', severity: 'MEDIUM' },
] as const;
export type WrongReason = (typeof WRONG_REASONS)[number]['key'];
