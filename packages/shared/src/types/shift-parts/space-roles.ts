/** Moved here unchanged from shift.ts. */
import type { PermissionSet } from '../permissions';
import { ShiftReminderState, WorkModel } from '../enums';

// ============================================================================
// DYNAMIC PER-SPACE SUB-ROLES
// ============================================================================

// Enforced space-role permissions. Kept minimal + real: each maps to a concrete
// server-side check (approval routing, rota mutation, attendance reconcile/view).
export const SPACE_ROLE_PERMISSION_SCHEMA = [
  {
    key: 'canApproveOvertime',
    label: 'Approve overtime',
    description: 'Can approve extra-time requests for this space',
  },
  { key: 'canManageRota', label: 'Manage rota', description: 'Can create shifts and assign members to shifts' },
  {
    key: 'canReconcileAttendance',
    label: 'Reconcile attendance',
    description: 'Receives escalations and can close/fix open entries',
  },
  {
    key: 'canViewSpaceAttendance',
    label: 'View space attendance',
    description: 'Can see attendance for everyone in this space',
  },
] as const;

export type SpaceRolePermissionKey = (typeof SPACE_ROLE_PERMISSION_SCHEMA)[number]['key'];

/**
 * What a space role grants.
 *
 * Was `Record<SpaceRolePermissionKey, boolean>` — the four attendance keys
 * below, which is what a space role meant before the unified access model.
 * It has meant more than that since: the server whitelists everything
 * ACCESS_PERMISSION_SCHEMA marks grantable on a space (sixteen keys), stores
 * it on the same JSON column, and resolveAccess honours all of it per space.
 * The narrow type made twelve of them un-typeable, so the editor could not
 * offer what the backend already enforced.
 *
 * PermissionSet is what is actually stored, so it is what this should say.
 */
export type SpaceRolePermissions = PermissionSet;

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
  /** WORK = a trade (grants nothing, carries a day rate); MANAGEMENT = permissions. */
  kind?: 'WORK' | 'MANAGEMENT';
}

/** A role as one workspace sees it: who holds it HERE, and its day rate HERE. */
export interface SpaceRoleInSpace extends SpaceRole {
  /** A work role switched on in this workspace (shown here, offered in its pickers). */
  activeHere?: boolean;
  holders: Array<{
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
    position?: string | null;
  }>;
  /** Holders across every workspace — while non-zero, the kind cannot change. */
  inUseCount: number;
  /** In force today; null when none is set. */
  dayRateCents: number | null;
  /** Where today's day rate comes from: this workspace's own, or the role's default. */
  dayRateSource?: 'workspace' | 'default' | null;
  /** This workspace's own day rates, oldest first. `scheduled` = starts after today. */
  dayRateHistory: Array<{ cents: number | null; effectiveFrom: string; state: 'past' | 'scheduled' }>;
  /** The role's default for every workspace that has not set its own. */
  defaultDayRateCents?: number | null;
  defaultDayRateHistory?: Array<{ cents: number | null; effectiveFrom: string; state: 'past' | 'scheduled' }>;
}

export interface SpaceMember {
  id: string;
  userId: string;
  spaceId?: string;
  /**
   * What this member is billed at, AT THIS CLIENT — the top rung of the ladder.
   *
   * ⚠️ Where a customer-facing rate belongs. What somebody COSTS is a fact
   * about the person and follows them everywhere; what a client PAYS for their
   * hour is a fact about that client, and the same engineer is routinely worth
   * €45 at one customer and €60 at another.
   *
   * Null inherits — the member's own rate, then the client's, then the
   * organisation's. Blank on almost every assignment, which is correct.
   */
  billRateCents?: number | null;
  costRateCents?: number | null;
  /**
   * What it WOULD be if this stayed blank, resolved by the server.
   *
   * Sent so the screen can show the inherited figure without re-implementing
   * the ladder in a browser — a second copy of that order is a second answer to
   * "why is this €40".
   */
  inheritedBillRateCents?: number | null;
  // Populated relations (optional)
  /** `isExternal`: works for a client or partner — no rate, no clock, no file. */
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    avatarUrl?: string | null;
    position?: string | null;
    isExternal?: boolean;
  };
  /** The management role here — the ONLY role that grants permissions. */
  spaceRole?: Pick<SpaceRole, 'id' | 'name' | 'slug' | 'color' | 'permissions' | 'kind'> | null;
  /** The trade here (a WORK role). Grants nothing; decides how work is billed. */
  workRole?: Pick<SpaceRole, 'id' | 'name' | 'slug' | 'color' | 'kind'> | null;
  /** May this member hold a work role AND a management role here? */
  allowSecondRole?: boolean;
  /** How this member's work here is billed; null = by the hour. */
  billBy?: 'HOUR' | 'DAY' | 'BOTH' | null;
  /** What applies: their choice, else HOUR. */
  effectiveBillBy?: 'HOUR' | 'DAY' | 'BOTH';
  /** Which hours go on the client's invoice; null = counted. */
  hoursBasis?: 'COUNTED' | 'CLOCKED' | 'SHIFT' | null;
  /** What applies: their choice, else COUNTED. */
  effectiveHoursBasis?: 'COUNTED' | 'CLOCKED' | 'SHIFT';
  /** What they cost you per hour / per day — from their profile. Absent without labour cost. */
  profileCostRateCents?: number | null;
  profileCostDayCents?: number | null;
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
