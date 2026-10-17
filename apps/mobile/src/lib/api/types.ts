import type { ResolvedAccess as ResolvedGrants } from '@hbcfield/shared/client';
import { TimeEntryStatus, BreakType, Role, Platform, TaskStatus, TaskPriority } from '@hbcfield/shared/client';
import type {
  CompanyLocation,
  TimeEntry,
  AttendanceStatus,
  Break,
  BreakStatus,
  ClockInInput,
  ClockOutInput,
  AttendanceHistoryParams,
  PaginatedResponse,
  InvitationValidation,
  AcceptInvitationInput,
  TechnicianListItem,
  TechniciansListResponse,
  GeofenceExcursion,
  GeofenceExcursionStatus,
  TaskHandover,
  JobTimeSplit,
  CrewView,
  JobTimeView,
  OpenRoleTask,
} from '@hbcfield/shared/client';
export {
  type TimeOffRequest,
  type TechnicianAvailability,
  type AvailabilityResponse,
  type ScheduleEntry,
} from './time-off-request';
export {
  type CreateTaskInput,
  type UpdateTaskInput,
  type HandoverJob,
  type MyHandovers,
  type Task,
  type ChecklistPerson,
  type ChecklistItem,
  type Comment,
  type TaskEvent,
  type LocationUpdate,
  type LocationPoint,
  type LocationBatchUpdate,
  type LocationResponse,
  type PartUsedInput,
  type CompleteTaskInput,
  type StepSubmission,
  type ServiceReport,
  type RegisterPushTokenInput,
} from './create-task-input';

// Re-export shared enums
export { TimeEntryStatus, BreakType, Role, Platform, TaskStatus, TaskPriority };

// Re-export shared types
export type {
  CompanyLocation,
  TimeEntry,
  AttendanceStatus,
  Break,
  BreakStatus,
  ClockInInput,
  ClockOutInput,
  AttendanceHistoryParams,
  PaginatedResponse,
  InvitationValidation,
  AcceptInvitationInput,
  TechnicianListItem,
  TechniciansListResponse,
  GeofenceExcursion,
  GeofenceExcursionStatus,
  // Answer shapes both apps declared — one definition now (shared http/types.ts).
  TaskHandover,
  JobTimeSplit,
  CrewView,
  JobTimeView,
  OpenRoleTask,
};

// ============================================================================
// Auth Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'CLIENT' | 'DISPATCHER' | 'TECHNICIAN' | 'EMPLOYEE' | 'CUSTOMER';
  organizationId: string | null;
  onboardingCompleted: boolean;
  /** Works for a client or partner (server-resolved). Absent on an older server = not external. */
  isExternal?: boolean;
  /**
   * A home screen the office set up for this member (`@hbcfield/shared`
   * `AssignedHome`). Applied once per `setAt`, then theirs to change.
   * Absent on an older server.
   */
  assignedHome?: { widgets: string[]; shortcuts: string[]; setAt: string } | null;
  // Customer portal: bound Customer + default unit (only for role=CUSTOMER).
  customerId?: string | null;
  unitId?: string | null;
  customerPortalEnabled?: boolean;
  /**
   * The organization's name.
   *
   * The server has always sent it on login, refresh and validateToken; this
   * type simply never declared it, so nothing on the phone could name the
   * company the member is working for.
   */
  organizationName?: string | null;
  avatarUrl?: string | null;
  // Permission fields
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  /**
   * The resolved grants — `{ org, perSpace }`.
   *
   * The server has always sent this on login and refresh; this type simply
   * never declared it, so every mobile check fell back to the flat columns
   * above. Those carry the ORG-wide answer only, which is why a member granted
   * "create tasks" by a SPACE role got no create screen here while the API
   * would have accepted the request.
   */
  access?: ResolvedGrants | null;
  // When true the member may clock in remotely (WFH / anywhere), geofence-exempt.
  // Sent in the login/validateToken payload; drives the mobile clock-in choice.
  allowRemote?: boolean;
  /** LEGACY — nothing reads it to decide access any more. */
  planTier?: string | null;
  /**
   * What the organization BOUGHT. Server-authoritative, sent in the
   * login/validateToken payload, and the same list PlanGuard checks — so a
   * screen hiding something the API would refuse, and vice versa, cannot drift.
   */
  orgAddOns?: string[] | null;
  /**
   * The offline-first app is switched on for this member's organization — the
   * staged rollout. Absent (an older server) means off.
   */
  offlineMode?: boolean;
  /** Org-level feature modules (custom fields, sprints, …). */
  orgModules?: string[] | null;
  // Technician-specific fields
  position?: string | null;
  /**
   * What this person is measured against — and therefore which shift card
   * they see.
   *
   * `FIXED` asks "am I on time?" and the hero before clocking in is the
   * rostered start. `FLEXIBLE` asks "am I on track this month?" and the hero
   * is hours against `monthlyHourBudget`. `NONE` promises nothing and gets
   * **no progress track at all** — ⚠️ a bar with no target invents one.
   *
   * ⚠️ SENT ON LOGIN ONLY. `auth.service.ts` puts it on the login context and
   * on neither of the other two request-context builders — refresh does not
   * set it, and validateToken SELECTS it and never returns it. So a session
   * restored from a token has no schedule kind, and the card reads `NONE`.
   *
   * ⚠️ ABSENT IS ANSWERED FROM THE DATA, NOT ASSUMED. `scheduleFor` in
   * `components/home/shift-state.ts` reads the shift itself: one the roster
   * gave both a start and an end is a FIXED shift whatever the payload left
   * out, and everything else is NONE. Assuming NONE outright would cost a
   * rostered member a bar they legitimately have a target for; assuming FIXED
   * would draw one against an invented target for the unconfigured majority,
   * which is rule 6 broken by a fallback.
   *
   * Putting it on all three builders is a server change and was declined.
   */
  scheduleType?: 'FIXED' | 'FLEXIBLE' | 'NONE' | null;
  /**
   * Target hours per month. Only meaningful for `FLEXIBLE`.
   *
   * ⚠️ NOT SENT BY ANY AUTH PATH TODAY, so it is always null and a FLEXIBLE
   * member gets no month bar. Declared here because the card already asks the
   * right question and will answer it the day the field travels — and because
   * a null budget renders nothing, which is better than a bar measuring
   * somebody against a number nobody set.
   */
  monthlyHourBudget?: number | null;
  // Manual availability override (null = auto from task).
  presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null;
  // Per-user clock display preference ("12h" | "24h"); display-only.
  timeFormat?: '12h' | '24h' | null;
  // Several workspaces: clock in where they stand ('AUTO') or always choose ('ASK').
  clockInPick?: 'AUTO' | 'ASK' | null;
  // IANA timezone of the org (e.g. "Europe/Vienna"). Default display zone for
  // times so they render in a fixed, labeled zone instead of the device's local
  // zone. Attendance call sites override per-entry with the location's timezone.
  organizationTimezone?: string | null;
  // Either a legacy string[] (org-level default) or a per-user AccessProfile
  // object ({ modules, platforms, spaceScope, canContact }). Read via the
  // shared getModules/hasModule/getAccessPlatforms helpers — never indexed directly.
  enabledModules?: string[] | Record<string, unknown> | null;
  specialty?: string | null;
  // Profile badge visibility (resolved: user override > org default > system default)
  profileBadges?: {
    showRole: boolean;

    showType: boolean;
    showSpecialty: boolean;
  };
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/** One of a task's files: the server's row, or a photo held on this phone until it is sent. */
export interface DetailAttachment {
  id: string;
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  pendingSync?: boolean;
}
