/**
 * Shared Shift-Scheduling Types (space-centric attendance)
 *
 * These types back the shift resolver, the reminder engine, and the dynamic
 * per-space sub-role system. Import from '@hbcfield/shared' — never redefine
 * in web/mobile.
 */

import { WorkModel, ShiftReminderState, ShiftRecurrence } from './enums';

// ============================================================================
// SHIFT DEFINITION
// ============================================================================

// A single named shift window. Times are LOCAL to the space's timezone.
// A shift crosses midnight when endLocal <= startLocal (e.g. 22:00 → 06:00).
export interface Shift {
  id: string;
  organizationId: string;
  spaceId: string | null; // null = org-wide, reusable across spaces
  name: string;
  description?: string | null;
  color?: string | null;
  startLocal: string; // "22:00"
  endLocal: string; // "06:00"
  crossesMidnight: boolean;
  breakMinutes: number; // Unpaid break subtracted from expected duration
  graceMin: number; // Minutes after end before the first reminder fires
  reminderIntervalMin: number; // Gap between subsequent reminders
  maxReminders: number; // Reminders before escalating to a space leader
  flagToleranceMin: number; // Grace before LATE_ARRIVAL / EARLY_DEPARTURE / OVERTIME
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShiftInput {
  spaceId?: string | null;
  name: string;
  description?: string;
  color?: string;
  startLocal: string;
  endLocal: string;
  breakMinutes?: number;
  graceMin?: number;
  reminderIntervalMin?: number;
  maxReminders?: number;
  flagToleranceMin?: number;
}

export type UpdateShiftInput = Partial<CreateShiftInput> & { isActive?: boolean };

// True when a shift's local end time is at/before its start → it crosses midnight.
export function shiftCrossesMidnight(startLocal: string, endLocal: string): boolean {
  return endLocal <= startLocal;
}

// ============================================================================
// SHIFT ASSIGNMENT (ROTA)
// ============================================================================

// Assigns a member to a shift within a space on a recurrence. Effective-dated:
// editing/deleting closes the current row (effectiveTo) instead of destroying
// history, so past attendance stays intact.
export interface ShiftAssignment {
  id: string;
  organizationId: string;
  userId: string;
  spaceId: string;
  shiftId: string;
  recurrence: ShiftRecurrence;
  daysOfWeek: number[]; // WEEKLY: 0=Sun..6=Sat
  daysOfMonth: number[]; // MONTHLY: 1..31
  dates: string[]; // ONE_OFF: explicit ISO dates
  effectiveFrom: string;
  effectiveTo?: string | null; // null = open-ended
  priority: number; // Higher wins when assignments overlap
  isActive: boolean;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated relations (optional)
  shift?: Pick<Shift, 'id' | 'name' | 'startLocal' | 'endLocal' | 'crossesMidnight' | 'color'>;
  user?: { id: string; firstName: string; lastName: string; email?: string };
}

export interface CreateShiftAssignmentInput {
  userId: string;
  spaceId: string;
  shiftId: string;
  recurrence: ShiftRecurrence;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  dates?: string[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  priority?: number;
}

export type UpdateShiftAssignmentInput = Partial<CreateShiftAssignmentInput> & { isActive?: boolean };

// ============================================================================
// DYNAMIC PER-SPACE SUB-ROLES
// ============================================================================

// Enforced space-role permissions. Kept minimal + real: each maps to a concrete
// server-side check (approval routing, rota mutation, attendance reconcile/view).
export const SPACE_ROLE_PERMISSION_SCHEMA = [
  { key: 'canApproveOvertime', label: 'Approve overtime', description: 'Can approve extra-time requests for this space' },
  { key: 'canManageRota', label: 'Manage rota', description: 'Can create shifts and assign members to shifts' },
  { key: 'canReconcileAttendance', label: 'Reconcile attendance', description: 'Receives escalations and can close/fix open entries' },
  { key: 'canViewSpaceAttendance', label: 'View space attendance', description: 'Can see attendance for everyone in this space' },
] as const;

export type SpaceRolePermissionKey = typeof SPACE_ROLE_PERMISSION_SCHEMA[number]['key'];

export type SpaceRolePermissions = Record<SpaceRolePermissionKey, boolean>;

export interface SpaceRole {
  id: string;
  organizationId: string;
  name: string; // "Shift Leader"
  slug: string;
  description?: string | null;
  color?: string | null;
  isSystem: boolean;
  permissions: SpaceRolePermissions;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { members: number };
}

export interface SpaceMember {
  id: string;
  userId: string;
  spaceId?: string;
  // Populated relations (optional)
  user?: { id: string; firstName: string; lastName: string; email?: string; avatarUrl?: string | null };
  spaceRole?: Pick<SpaceRole, 'id' | 'name' | 'slug' | 'color' | 'permissions'> | null;
  // Per-member, per-space routing override (Phase 4d). Empty = space default.
  notifyRoleIds?: string[];
  notifyUserIds?: string[];
  contactRoleIds?: string[];
  contactUserIds?: string[];
  /*
    Who signs off FOR this member — deliberately its own list.

    Not a synonym for notify: wanting to hear about somebody's shifts is not
    authority over their hours, and collapsing the two would hand document
    sign-off to everyone who ever asked to be kept informed.
  */
  approveRoleIds?: string[];
  approveUserIds?: string[];
}

// Whether a member (via their space role) holds a given space permission.
export function spaceRoleAllows(
  role: Pick<SpaceRole, 'permissions'> | null | undefined,
  permission: SpaceRolePermissionKey,
): boolean {
  return role?.permissions?.[permission] === true;
}

// Built-in space roles seeded per org (isSystem). Editable but not deletable.
// Slugs are stable identifiers used by seeds + routing.
export const BUILTIN_SPACE_ROLES: {
  slug: string;
  name: string;
  description: string;
  color: string;
  permissions: SpaceRolePermissions;
}[] = [
  {
    slug: 'space-manager',
    name: 'Space Manager',
    description: 'Full attendance authority for the space',
    color: '#2563eb',
    permissions: {
      canApproveOvertime: true,
      canManageRota: true,
      canReconcileAttendance: true,
      canViewSpaceAttendance: true,
    },
  },
  {
    slug: 'shift-leader',
    name: 'Shift Leader',
    description: 'Approves overtime and reconciles open shifts',
    color: '#16a34a',
    permissions: {
      canApproveOvertime: true,
      canManageRota: false,
      canReconcileAttendance: true,
      canViewSpaceAttendance: true,
    },
  },
  {
    slug: 'team-leader',
    name: 'Team Leader',
    description: 'Approves overtime for their team',
    color: '#ca8a04',
    permissions: {
      canApproveOvertime: true,
      canManageRota: false,
      canReconcileAttendance: false,
      canViewSpaceAttendance: true,
    },
  },
];

// ============================================================================
// WORK MODEL LABELS
// ============================================================================

export const WORK_MODEL_LABELS: Record<WorkModel, string> = {
  [WorkModel.NONE]: 'No time expectations',
  [WorkModel.SHIFT]: 'Shift-based',
  [WorkModel.FIXED]: 'Fixed weekly schedule',
  [WorkModel.TASK]: 'Task-based',
};

export const SHIFT_REMINDER_STATE_LABELS: Record<ShiftReminderState, string> = {
  [ShiftReminderState.NONE]: 'On shift',
  [ShiftReminderState.REMINDED]: 'Reminder sent',
  [ShiftReminderState.OVERTIME_PENDING]: 'Overtime pending',
  [ShiftReminderState.OVERTIME_APPROVED]: 'Overtime approved',
  [ShiftReminderState.ESCALATED]: 'Escalated',
  [ShiftReminderState.RESOLVED]: 'Resolved',
};
