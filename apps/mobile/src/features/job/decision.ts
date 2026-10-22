import {
  getStatusCapabilities,
  hasCapability,
  type FlowStatus,
  type TaskCapability,
} from '@hbcfield/shared/client';
import type { ChecklistItem } from '../../lib/api/types';

export const BLOCKED = 'BLOCKED';

export const IN_PROGRESS = 'IN_PROGRESS';

/* ---------------- the flow ---------------- */

/** The steps the bar draws: the flow's own, without the cancel state and without the Blocked side state. */
export function mainSteps(steps: readonly FlowStatus[]): FlowStatus[] {
  return steps.filter((s) => !s.isCanceled && s.key !== BLOCKED);
}

/**
 * Where the job is on the bar: `index` of the current step (Blocked counts as
 * the working step it stopped), the total, and the step after it.
 */
export function stepPosition(status: string, steps: readonly FlowStatus[]): { index: number; total: number; next: FlowStatus | null } {
  const main = mainSteps(steps);
  let index = main.findIndex((s) => s.key === status);
  if (index < 0 && status === BLOCKED) {
    // The step Blocked resumes to is where the work stopped.
    const back = steps.find((s) => s.key === BLOCKED)?.transitions.find((k) => k !== BLOCKED) ?? IN_PROGRESS;
    index = main.findIndex((s) => s.key === back);
  }
  if (index < 0 && status === 'CLOSED') index = main.length - 1;
  return { index, total: main.length, next: index >= 0 ? main[index + 1] ?? null : null };
}

/** Over — finished or called off. Read from the flow first; the built-in words only when the flow does not say. */
export function isClosedStatus(status: string, steps: readonly FlowStatus[]): boolean {
  const s = steps.find((x) => x.key === status);
  if (s) return s.isFinal || s.isCanceled;
  return ['COMPLETED', 'CANCELED', 'CLOSED'].includes(status);
}

export function isCanceledStatus(status: string, steps: readonly FlowStatus[]): boolean {
  const s = steps.find((x) => x.key === status);
  if (s) return s.isCanceled;
  return status === 'CANCELED';
}

/** The capabilities a step turns on — the flow's own list (admin-editable) first, the shipped preset only when it says nothing. */
export function capsAt(key: string, steps: readonly FlowStatus[], workflowName?: string | null): TaskCapability[] {
  const own = steps.find((s) => s.key === key)?.capabilities;
  return own ?? getStatusCapabilities(workflowName, key);
}

/**
 * Does moving to this step close the job with a service report?
 *
 * The same test the screen always made — a final step whose capabilities
 * include `report` — now reading the flow's own capabilities before the preset.
 */
export function needsReport(target: string, steps: readonly FlowStatus[], workflowName?: string | null): boolean {
  const step = steps.find((s) => s.key === target);
  const final = target === 'COMPLETED' || !!step?.isFinal;
  return final && hasCapability(capsAt(target, steps, workflowName), 'report');
}

/** The first step at which the checklist can be ticked — "Opens for ticking at the Working step". */
export function checklistStep(steps: readonly FlowStatus[], workflowName?: string | null): string | null {
  return mainSteps(steps).find((s) => hasCapability(capsAt(s.key, steps, workflowName), 'checklist'))?.key ?? null;
}

/* ---------------- what the bottom button does ---------------- */

export interface Decision {
  /** The one button. `null` = nothing to press. */
  primary: string | null;
  /** Every other onward step, for ⋯ — in the flow's order. */
  rest: string[];
  /** The job is blocked and the button takes it back to work. */
  resume: boolean;
}

/* ---------------- who is looking ---------------- */

export type DockMode = 'closed' | 'overseer' | 'doer';

/**
 * ⚠️ "Am I doing this job", NOT "am I an admin". Somebody who oversees AND is
 * the assignee does the work first — their managing actions move into ⋯. A
 * member who does not oversee keeps the doer's dock, as the screen always did.
 */
export function dockMode(input: { closed: boolean; oversees: boolean; isMine: boolean }): DockMode {
  if (input.closed) return 'closed';
  if (input.oversees && !input.isMine) return 'overseer';
  return 'doer';
}

/**
 * "Not me" — offered only while the job is merely ASSIGNED to the reader.
 * The server refuses a decline from any other state (TASK_STATE_CONFLICT) or
 * by anybody else (TASK_REASSIGNED), so offering it there is a dead button.
 */
export function canDecline(input: { isMine: boolean; status: string }): boolean {
  return input.isMine && input.status === 'ASSIGNED';
}

export type MoreOption =
  | { kind: 'step'; to: string }
  | { kind: 'issue' }
  | { kind: 'decline' }
  | { kind: 'maps' }
  | { kind: 'assign' }
  | { kind: 'edit' }
  | { kind: 'cancel' };

/** What ⋯ holds, in the order the mockup draws it. */
export function moreOptions(input: {
  mode: DockMode;
  decision: Decision;
  isMine: boolean;
  status: string;
  hasPlace: boolean;
  oversees: boolean;
  canAssign: boolean;
  canEdit: boolean;
}): MoreOption[] {
  const out: MoreOption[] = [];
  if (input.mode === 'doer') {
    for (const k of input.decision.rest) out.push(k === BLOCKED ? { kind: 'issue' } : { kind: 'step', to: k });
    if (canDecline(input)) out.push({ kind: 'decline' });
  }
  if (input.hasPlace) out.push({ kind: 'maps' });
  if (input.oversees && input.mode !== 'closed') {
    if (input.canAssign) out.push({ kind: 'assign' });
    if (input.canEdit) out.push({ kind: 'edit' });
    out.push({ kind: 'cancel' });
  }
  return out;
}

/**
 * A sheet another screen may open the job page on — `/task/:id?sheet=…`.
 * The Jobs tab hands over here for the steps that live on the page. Anything
 * else in the parameter is ignored: a link must never open a sheet the page
 * does not offer from its own buttons.
 *
 * `form:<STEP>` opens the step form for moving the job to that step (Next up
 * hands a step with a form over this way). `finish` is the older link and
 * means the same for the dock's own next step.
 */
export type OpenSheet = 'issue' | 'decline' | 'cancel' | 'assign' | 'edit' | 'finish' | 'handover' | `form:${string}`;

// `handover`: "write what you did" — the home strip opens the job on it.
/*
  ⚠️ NO `join`. "I'm with him" used to arrive as `?sheet=join` and the page
  joined the crew on open — so any hbcfield:// link could join a member to a
  job. Every sheet here only OPENS something the member then confirms; a link
  that ACTS is not a sheet. The push's button now hands the join over in
  memory (`lib/join-intent.ts`).
*/
export const OPEN_SHEETS: readonly string[] = ['issue', 'decline', 'cancel', 'assign', 'edit', 'finish', 'handover'];

export const FORM_SHEET = /^form:([A-Za-z0-9_-]{1,64})$/;

export function parseOpenSheet(v: unknown): OpenSheet | null {
  const one = Array.isArray(v) ? v[0] : v;
  if (typeof one !== 'string') return null;
  if (OPEN_SHEETS.includes(one) || FORM_SHEET.test(one)) return one as OpenSheet;
  return null;
}

/** The sheet that asks a step's form. */
export function formSheet(to: string): OpenSheet {
  return `form:${to}`;
}

/** The step a `form:<STEP>` sheet moves to; null for any other sheet. */
export function formSheetTarget(sheet: OpenSheet | null | undefined): string | null {
  const m = FORM_SHEET.exec(sheet ?? '');
  return m ? m[1]! : null;
}

/* ---------------- dates ---------------- */

/** Due on a later day than today — the job cannot be started yet. */
export function isFutureDue(dueDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return new Date(dueDate) > endOfToday;
}

/** The travel step is held until the job's day — the gate the screen always had. */
export function heldUntilDue(target: string | null, dueDate: string | null | undefined, now: Date = new Date()): boolean {
  return target === 'EN_ROUTE' && isFutureDue(dueDate, now);
}

/** "1:12" — hours and minutes on the job. Never seconds: nobody reads them at arm's length. */
export function formatOnJob(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/* ---------------- the checklist ---------------- */

/** A checklist item as the job page holds it — the API's own shape, owner and tick included. */
export type CheckItem = ChecklistItem;

export type ChecklistMode = 'tick' | 'offline' | 'readonly';

/**
 * Tickable only by the person doing the work, at a step that opens it, where
 * the workspace runs checklists. With no signal the boxes stay visible and do
 * not move — there is no outbox operation for a tick, so one made offline
 * would be a promise the phone cannot keep.
 */
export function checklistMode(input: { doer: boolean; stepHasChecklist: boolean; moduleOn: boolean; offline: boolean }): ChecklistMode {
  if (!input.doer || !input.stepHasChecklist || !input.moduleOn) return 'readonly';
  return input.offline ? 'offline' : 'tick';
}

/** One item flipped, the rest untouched. */
export function withTick(items: readonly CheckItem[], id: string, value: boolean): CheckItem[] {
  return items.map((it) => (it.id === id ? { ...it, isCompleted: value } : it));
}

/**
 * Change ONE item optimistically; put back ONLY that item if the server says no,
 * and take the server's copy of it when it says yes (who ticked it, the owner's name).
 *
 * ⚠️ Rolling back the whole list would undo a second change made while the
 * first was in flight. `apply` receives an updater, never a snapshot.
 */
export async function patchOptimistic(
  id: string,
  patch: Partial<CheckItem>,
  apply: (update: (items: CheckItem[]) => CheckItem[]) => void,
  send: () => Promise<unknown>,
): Promise<boolean> {
  let before: CheckItem | undefined;
  apply((items) => items.map((it) => (it.id === id ? ((before = it), { ...it, ...patch }) : it)));
  try {
    const saved = await send();
    if (saved && typeof saved === 'object' && (saved as { id?: unknown }).id === id) {
      apply((items) => items.map((it) => (it.id === id ? { ...it, ...(saved as Partial<CheckItem>) } : it)));
    }
    return true;
  } catch {
    const back = before;
    if (back)
      apply((items) =>
        items.map((it) => (it.id === id ? { ...it, ...pick(back, Object.keys(patch) as Array<keyof CheckItem>) } : it)),
      );
    return false;
  }
}

/** Tick optimistically — a tick is one kind of change to one item. */
export function tickOptimistic(
  id: string,
  value: boolean,
  apply: (update: (items: CheckItem[]) => CheckItem[]) => void,
  send: () => Promise<unknown>,
): Promise<boolean> {
  return patchOptimistic(id, { isCompleted: value }, apply, send);
}

export function pick<T>(o: T, keys: Array<keyof T>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = o[k];
  return out;
}

/* ---------------- reporting an issue ---------------- */

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

/** The reason the office reads — what, how badly, and the note. One line, no invented words. */
export function issueReason(what: string, severityLabel: string, note: string): string {
  const head = `${what.trim()} (${severityLabel})`;
  return note.trim() ? `${head}. ${note.trim()}` : head;
}
