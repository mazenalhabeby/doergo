/**
 * Workspace dashboard helpers — ported from the web admin dashboard
 * (apps/web-app/src/app/(dashboard)/dashboard/_components/client-dashboard.tsx).
 * Pure functions: avatar colors, status derivation, time formatting.
 */
import type { Task } from '../../../lib/api';
import type { TimeEntry } from '../../../lib/api/types';

export type WorkerStatus = 'on' | 'busy' | 'away' | 'off';
export type TagVariant = 'task' | 'hrs';
export interface PersonTag {
  text: string;
  variant: TagVariant;
}
export type DotColor = 'green' | 'blue' | 'amber' | 'red' | 'purple';

export const AVATAR_COLORS: [string, string][] = [
  ['#6366f1', '#8b5cf6'],
  ['#3b82f6', '#06b6d4'],
  ['#10b981', '#059669'],
  ['#f59e0b', '#d97706'],
  ['#ef4444', '#dc2626'],
  ['#ec4899', '#db2777'],
  ['#8b5cf6', '#a855f7'],
  ['#14b8a6', '#0d9488'],
];

export function getInitials(firstName?: string, lastName?: string): string {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Returns a [start, end] gradient color pair for a stable avatar background. */
export function getAvatarColors(id: string): [string, string] {
  return AVATAR_COLORS[hashString(id) % AVATAR_COLORS.length]!;
}

/**
 * Employee status/label — kept in sync with the web dashboard
 * (client-dashboard.tsx). Availability (the status the user sets) is the primary
 * signal; clock-in adds context ("On Shift"/"Remote"/"In Field"). "Available"
 * (logged in, not clocked in) reads differently from being on the clock.
 */
export function getEmployeeStatus(opts: {
  isClockedIn: boolean;
  isOnBreak: boolean;
  isOnline: boolean; // app-active within the last few minutes
  presence?: string | null; // AVAILABLE / BUSY / AWAY (defaults to Available)
  isRemote?: boolean; // clocked in via remote / WFH
  isOnRoad?: boolean; // workMode ON_ROAD (driving / field)
}): { status: WorkerStatus; tag?: PersonTag } {
  // Genuinely offline: not app-active AND not on the clock.
  if (!opts.isOnline && !opts.isClockedIn) return { status: 'off' };
  if (opts.isClockedIn && opts.isOnBreak) return { status: 'on', tag: { text: 'On Break', variant: 'hrs' } };
  // Availability the user deliberately set overrides the default clock label.
  if (opts.presence === 'BUSY') return { status: 'busy', tag: { text: 'Busy', variant: 'task' } };
  if (opts.presence === 'AWAY') return { status: 'away', tag: { text: 'Away', variant: 'hrs' } };
  // On the clock → label by how/where they're working.
  if (opts.isClockedIn) {
    if (opts.isOnRoad) return { status: 'on', tag: { text: 'In Field', variant: 'task' } };
    if (opts.isRemote) return { status: 'on', tag: { text: 'Remote', variant: 'task' } };
    return { status: 'on', tag: { text: 'On Shift', variant: 'hrs' } };
  }
  // Logged in / online but not clocked in.
  return { status: 'on', tag: { text: 'Available', variant: 'hrs' } };
}

/** App-active within the last 3 minutes → treated as online (matches web). */
export function isOnline(lastActiveAt?: string | null): boolean {
  return !!lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() < 3 * 60 * 1000;
}

/** "Currently clocked in" = active entry with no clock-out yet. */
export function isClockedIn(entry: TimeEntry): boolean {
  return entry.status === 'CLOCKED_IN' && !entry.clockOutAt;
}

/** Today's date as YYYY-MM-DD. */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0]!;
}

/** Human-readable elapsed time since a date string. */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Short display name: "Mike W." */
export function shortName(firstName?: string, lastName?: string): string {
  return `${firstName || ''} ${lastName?.[0] || ''}.`.trim();
}

/** Map task status → activity dot color. */
export const STATUS_DOT: Record<string, DotColor> = {
  IN_PROGRESS: 'green',
  EN_ROUTE: 'blue',
  ARRIVED: 'green',
  COMPLETED: 'blue',
  BLOCKED: 'red',
  ASSIGNED: 'amber',
  ACCEPTED: 'green',
  NEW: 'purple',
  CANCELED: 'red',
};

/** Map task status → activity verb. */
export const STATUS_ACTION: Record<string, string> = {
  IN_PROGRESS: 'started working on',
  EN_ROUTE: 'en route to',
  ARRIVED: 'arrived at',
  COMPLETED: 'completed',
  BLOCKED: 'blocked on',
  ASSIGNED: 'was assigned to',
  ACCEPTED: 'accepted',
  NEW: 'created',
  CANCELED: 'canceled',
};

/** Priority ranking used to pick a worker's single "active" task. */
export const ACTIVE_TASK_PRIORITY: Record<string, number> = {
  IN_PROGRESS: 4,
  ARRIVED: 3,
  EN_ROUTE: 2,
  BLOCKED: 1,
};

export function isTaskOverdue(task: Task): boolean {
  return (
    !!task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    !['COMPLETED', 'CLOSED', 'CANCELED'].includes(task.status)
  );
}
