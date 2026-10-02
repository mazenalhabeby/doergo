import type { ResolvedAccess as ResolvedGrants } from '@hbcfield/shared/client';
import {
  

  TimeEntryStatus,
  BreakType,
  Role,
  Platform,
  TaskStatus,
  TaskPriority,
} from '@hbcfield/shared/client';
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
} from '@hbcfield/shared/client';

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

// ============================================================================
// Task Types
// ============================================================================

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  assignedToId?: string;
  spaceId?: string;
  /**
   * The CRM client this job is for — a client VISIT rather than a bare task.
   *
   * Accepted by `CreateTaskDto` on the gateway since client visits shipped; the
   * phone had no client concept at all, so a job raised from a client record
   * arrived unattached to them.
   */
  customerId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationAddress?: string;
}

/** "What I did, and what is left" — written by a worker who stopped. */
export interface TaskHandover {
  id: string;
  note: string;
  attachmentIds: string[];
  workedMinutes: number | null;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string; avatarUrl?: string | null };
}

/** Minutes of a job's time, split (packages/shared/src/tasks/job-time.ts). */
export interface JobTimeSplit { travel: number; working: number; blocked: number }

type Person = { id: string; firstName: string; lastName: string };

/** GET /tasks/:id/time — read, never stored; only time inside shifts counts. */
/** Who is on a crew job now, and who leads (shared tasks/crew.ts) — rides on GET /tasks/:id/time. */
export interface CrewView {
  /** The organization's crew rules: only the leader moves the job's step. */
  crewMode: boolean;
  leader: { userId: string | null; acting: boolean; source: 'TODAY' | 'LEAD' | 'ACTING' | 'NONE' };
  /** A lead handed over for today, while it lasts. */
  today: { userId: string; until: string } | null;
  members: Array<{
    user: Person;
    role: 'LEAD' | 'MEMBER';
    joined: boolean;
    since: string | null;
    selfBlockedSince: string | null;
    selfBlockReason: string | null;
    onClock: boolean;
  }>;
}

export interface JobTimeView {
  asOf: string;
  total: JobTimeSplit;
  /** `live`: what that person's time is running as now — their own stop makes it blocked. */
  byWorker: Array<JobTimeSplit & { user: Person; live?: keyof JobTimeSplit | null }>;
  crew?: CrewView | null;
  /** Running now (somebody credited is on the clock): a screen may tick it forward from `asOf`. */
  live: { kind: keyof JobTimeSplit; workers: number } | null;
  /** The first move into counted time — and, when the office made it for somebody, who and why. */
  startedBy: { user: Person | null; forUser: Person | null; office: boolean; reason: string | null; at: string } | null;
}

/** One job in the member's own handover picture (GET /tasks/handover/mine). */
export interface HandoverJob {
  id: string;
  /** My working minutes on it so far (open and paused jobs only). */
  workedMinutes?: number;
  /** Somebody else who joined is still on the clock: the crew carries on after this clock-out (shared tasks/crew.ts). */
  crewContinues?: boolean;
  title: string;
  status: string;
  pausedAt: string | null;
  pausedById: string | null;
  locationAddress: string | null;
  customer: { name: string } | null;
}

export interface MyHandovers {
  /** In a working step now — what the clock-out sheet lists. */
  open: HandoverJob[];
  /** A note I still owe. */
  owed: HandoverJob[];
  /** Paused on me — offered at the next clock-in. */
  paused: HandoverJob[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  /**
   * Does this task's flow have a travel step? Server-computed from the
   * workflow, NOT from the presence of coordinates. Absent on older gateways —
   * see isMyRouteStop for why absent must read as yes.
   */
  tracksLocation?: boolean;
  organizationId: string;
  createdById: string;
  assignedToId?: string;
  createdAt: string;
  updatedAt: string;
  /*
    Paused at a clock-out (packages/shared/src/tasks/handover.ts): the job is in a
    working step with nobody on it. "Resume work" clears it; so does any move.
  */
  pausedAt?: string | null;
  pausedById?: string | null;
  /** Who still owes the note of what they did — asked on every app open until written. */
  handoverDueById?: string | null;
  /** Detail only: the names, and the time the one who owes it put in. */
  pausedBy?: { id: string; firstName: string; lastName: string } | null;
  handoverDue?: { user: { id: string; firstName: string; lastName: string } | null; workedMinutes: number | null } | null;
  /** Detail only: the newest notes first. */
  handovers?: TaskHandover[];
  // DB-derived task-time anchors (timer counts from acceptedAt; freezes at completedAt)
  acceptedAt?: string | null;
  completedAt?: string | null;
  /**
   * Stamped when the task goes En Route -> Arrived. The product's own record
   * that this drive has been made, which is how "Start navigation" knows not
   * to route somebody back to a stop they are standing at.
   */
  routeStartedAt?: string | null;
  routeEndedAt?: string | null;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
  };
  /** The task's checklist, in order — present on `GET /tasks/:id`. */
  checklistItems?: ChecklistItem[];
  /** The workspace it lives in — present on `GET /tasks/:id`. */
  space?: { id: string; name: string; enabledModules?: string[] | null; workflowId?: string | null } | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
  position: number;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface TaskEvent {
  id: string;
  eventType: string;
  metadata?: Record<string, any>;
  createdAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

// ============================================================================
// Tracking Types
// ============================================================================

export interface LocationUpdate {
  lat: number;
  lng: number;
  accuracy?: number;
  taskId?: string;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: string;
}

export interface LocationBatchUpdate {
  taskId?: string;
  points: LocationPoint[];
}

export interface LocationResponse {
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: string;
}

// ============================================================================
// Report Types
// ============================================================================

export interface PartUsedInput {
  name: string;
  partNumber?: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
}

export interface CompleteTaskInput {
  summary: string;
  workPerformed?: string;
  workDuration: number; // in seconds
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  partsUsed?: PartUsedInput[];
}

/** One row of `GET /tasks/:id/submissions` — the answers a job was moved into a step with. */
export interface StepSubmission {
  id: string;
  statusKey: string;
  formVersion?: number;
  /** The form as it was when answered — a later edit of the workflow does not rewrite an old report. */
  form: unknown;
  answers: Record<string, string | string[] | number | boolean>;
  /** The photos and signatures the answers name, by attachment id, with signed links. */
  files: Record<string, { id?: string; fileName?: string | null; url?: string | null; fileUrl?: string | null; mimeType?: string | null }>;
  submittedAt: string;
  submittedBy?: { id?: string; firstName?: string | null; lastName?: string | null } | null;
}

export interface ServiceReport {
  id: string;
  taskId: string;
  summary: string;
  workPerformed?: string;
  workDuration: number;
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  completedAt: string;
  completedById: string;
}

// ============================================================================
// Push Types
// ============================================================================

export interface RegisterPushTokenInput {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
}

// ============================================================================
// Time-Off Types
// ============================================================================

export interface TimeOffRequest {
  id: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  approvedById?: string;
  approvedBy?: { id: string; firstName: string; lastName: string };
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Availability & Schedule Types
// ============================================================================

export interface TechnicianAvailability {
  id: string;
  firstName: string;
  lastName: string;
  isAvailable: boolean;
  onTimeOff: boolean;
  schedule: { startTime: string; endTime: string } | null;
  timeOff: { id: string; reason?: string } | null;
}

export interface AvailabilityResponse {
  date: string;
  dayOfWeek: number;
  dayName: string;
  technicians: TechnicianAvailability[];
  summary: { total: number; available: number; onTimeOff: number; notScheduled: number };
}

export interface ScheduleEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  notes?: string;
}
