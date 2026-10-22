/**
 * New job's decisions — `docs/design/job-flow.html`, `renderCreate()`.
 *
 * ⚠️ PURE AND REACT-NATIVE-FREE: the rules the form acts on are tested
 * (`new-job-*.spec.ts`); the screen only draws what these return.
 */
import type { CreateTaskInput } from '@/lib/api/types';

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = typeof PRIORITIES[number];

/** A route param that may arrive as a string, an array, or not at all. */
export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

/** "Create job" is pressable once there is a title, and not while one is being sent. */
export function canCreate(title: string, submitting = false): boolean {
  return title.trim().length > 0 && !submitting;
}

/**
 * The due date as it is stored.
 *
 * ⚠️ MIDNIGHT IS "NO HOUR GIVEN" (`appointment-times`). The phone counts down
 * to a departure only for jobs that name one, so a day on its own must keep
 * producing local midnight; an hour ("HH:mm") is folded in only when chosen.
 */
export function dueDateFor(day: Date | null, hhmm: string): string | undefined {
  if (!day) return undefined;
  const d = new Date(day);
  const [hh, mm] = hhmm.split(':').map(Number);
  const timed = !!hhmm && Number.isFinite(hh);
  d.setHours(timed ? hh! : 0, timed && Number.isFinite(mm) ? mm! : 0, 0, 0);
  return d.toISOString();
}

/* ---------------- raised from a client record ---------------- */

export interface ClientParams {
  customerId?: string | string[];
  spaceId?: string | string[];
  customerName?: string | string[];
}

/**
 * RAISED FROM A CLIENT RECORD — adopted once.
 *
 * ⚠️ New job is a TAB: mounted for the session, its params stick. They are
 * ADOPTED into the form and then cleared from the route, so the tab has
 * exactly one arrival that carries a client and every later one is blank.
 * Only a NON-EMPTY id adopts, which is what makes the clear loop-free.
 */
export function adoptClient(params: ClientParams): { client: { id: string; name: string }; spaceId: string | null } | null {
  const id = one(params.customerId);
  if (!id) return null;
  return { client: { id, name: one(params.customerName) }, spaceId: one(params.spaceId) || null };
}

/**
 * Nothing typed, picked or photographed. Leaving a form in this state drops
 * the client it was opened for; a half-written client visit keeps it.
 */
export function isUntouched(f: { title: string; description: string; day: Date | null; photoCount: number }): boolean {
  return !f.title.trim() && !f.description.trim() && !f.day && f.photoCount === 0;
}

/** Every job needs a workspace: the org's default, else "General", else the first. */
export function defaultSpace(list: ReadonlyArray<{ id: string; name: string; isDefault?: boolean }>): string | null {
  return (list.find((o) => o.isDefault) ?? list.find((o) => o.name === 'General') ?? list[0])?.id ?? null;
}

/**
 * The job as it is sent. The assignee goes only for somebody who may assign —
 * the server refuses it from anybody else, and the form never offers it.
 */
export function buildCreateInput(f: {
  title: string;
  description: string;
  priority: Priority;
  day: Date | null;
  time: string;
  address: string;
  lat: number | null;
  lng: number | null;
  spaceId: string | null;
  clientId: string | null;
  assigneeId: string | null;
  canAssign: boolean;
}): CreateTaskInput {
  return {
    title: f.title.trim(),
    description: f.description.trim() || undefined,
    priority: f.priority,
    dueDate: dueDateFor(f.day, f.time),
    locationAddress: f.address.trim() || undefined,
    locationLat: f.lat ?? undefined,
    locationLng: f.lng ?? undefined,
    ...(f.spaceId ? { spaceId: f.spaceId } : {}),
    // A client visit rather than a bare job.
    ...(f.clientId ? { customerId: f.clientId } : {}),
    ...(f.canAssign && f.assigneeId ? { assignedToId: f.assigneeId } : {}),
  };
}

/* ---------------- the day picker ---------------- */

/** A month as weeks, Monday first; `null` pads the days outside it. */
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** A due date is not in the past: days before today cannot be picked. */
export function isPastDay(d: Date, now: Date = new Date()): boolean {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return a < b;
}

export const HOURS: readonly number[] = Array.from({ length: 24 }, (_, i) => i);
/** Five-minute steps — a client says "half nine", never "09:37". */
export const MINUTES: readonly number[] = Array.from({ length: 12 }, (_, i) => i * 5);
export const two = (n: number) => String(n).padStart(2, '0');
