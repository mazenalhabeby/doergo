/**
 * Types the task-service messages carry, moved here from task-service so the
 * gateway and the service read one definition (each kept in task-service under
 * its old name as an alias). Renamed only where the old name was too generic
 * for the shared package (Caller → CalendarCaller, Facts → RoleTaskFacts …).
 */
import type { ApprovalKind } from '../../approvals/kinds/kind-specs';
import type { SyncPullScope } from '../../sync/protocol';
import type { AttendanceScope } from '../../access/space-scope';

/** The caller, as the gateway resolved it from the token — never from the body. */
export interface CalendarCaller {
  userId: string;
  organizationId: string;
  role?: string;
  canManageUsers?: boolean;
  /** Org-wide canViewAllTasks — may invite anybody in the organization. */
  orgWideView?: boolean;
  /** May read the client book — only then may an event name a client, or show one. */
  crm?: boolean;
  /** Where the caller sees the team's leave (undefined = everywhere, [] = nowhere). */
  teamSpaces?: string[];
}

export interface CalendarEventMessage {
  kind?: 'APPOINTMENT' | 'REMINDER';
  title?: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  customerId?: string | null;
  spaceId?: string | null;
  allDay?: boolean;
  /** Timed: ISO instants. */
  startAt?: string;
  endAt?: string;
  /** All-day: local dates, end inclusive. */
  startDate?: string;
  endDate?: string;
  timezone?: string;
  repeat?: unknown;
  reminders?: unknown;
  visibility?: 'BUSY' | 'DETAILS';
  attendeeIds?: string[];
  /** How and where (shared calendar/meeting.ts). */
  meetingMode?: 'IN_PERSON' | 'ONLINE' | 'PHONE' | null;
  placeKind?: 'OFFICE' | 'CLIENT_SITE' | 'ADDRESS' | null;
  placeSpaceId?: string | null;
  room?: string | null;
  phone?: string | null;
  callDirection?: 'OUTGOING' | 'INCOMING' | null;
}

export interface CalendarItemsQuery extends CalendarCaller {
  from: string;
  to: string;
  spaceId?: string | null;
  layers?: string[];
  lang?: string;
  /** Workspaces where the caller sees ALL the work. undefined = everywhere, [] = only their own. */
  viewTaskSpaces?: string[];
  /** Workspaces where the caller sees the team's leave. undefined = everywhere, [] = nowhere. */
  teamSpaces?: string[];
}

/** undefined = org-wide authority, [ids] = only these workspaces, [] = nowhere. */
export type HolidayScope = string[] | undefined;

export type RoleTaskFacts = { userId: string; organizationId: string };

export interface TaskAccessFacts {
  userId: string;
  userRole: string;
  organizationId: string;
  /** The ORG-wide resolution of canViewAllTasks. */
  canViewAllTasks?: boolean;
  /** Cross-org spaces shared with this caller (server-authoritative). */
  sharedSpaceIds?: string[];
  /** Spaces where the caller holds canViewAllTasks through a SPACE role. */
  viewAllSpaceIds?: string[];
}

export interface TaskVisibilityFacts {
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  /** Spaces where the caller holds canViewAllTasks by a SPACE role. */
  viewAllSpaceIds?: string[];
  organizationId: string;
}

export interface SyncPullRequest extends TaskVisibilityFacts {
  scope: SyncPullScope;
  cursor?: string | null;
  limit?: number;
}

export interface TaskSearchInput {
  organizationId: string;
  userId: string;
  userRole?: string;
  canViewAllTasks?: boolean;
  /** Spaces where the caller holds canViewAllTasks by a SPACE role (`spacesGranting`). */
  viewAllSpaceIds?: string[];
  /** Cross-org spaces shared WITH the caller's org (server-authoritative, from the token grant). */
  sharedSpaceIds?: string[];
  query: string;
  limit?: number;
}

export interface StandInCaller {
  organizationId: string;
  userId: string;
  /** Admin, or `canManageUsers` held org-wide on their OWN access: may arrange anybody's. */
  managesPeople: boolean;
}

export interface ApprovalRouteInput {
  organizationId: string;
  callerId: string;
  kind: ApprovalKind;
  spaceId: string | null;
  subjectUserId: string | null;
}

export interface BreakRuleInput {
  spaceId?: string | null;
  shiftId?: string | null;
  name?: string;
  trigger?: string;
  afterMinutes?: number | null;
  earliestLocal?: string | null;
  latestLocal?: string | null;
  durationMinutes?: number;
  isPaid?: boolean;
  isRequired?: boolean;
  remind?: boolean;
  snoozeMin?: number;
  maxSnoozes?: number | null;
  isActive?: boolean;
  position?: number;
}

export type ShiftIssueAttachment = {
  fileKey: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number | null;
  height?: number | null;
};

export interface ExtraTimeDecisionMessage {
  /** Spaces the caller may act in; null = org-wide, [] = none. */
  scopeSpaceIds?: AttendanceScope;
  approverId: string;
  entryId: string;
  minutes: number;
  organizationId: string;
  /** base64 PNG, when the leader signed rather than tapping approve. */
  signature?: string | null;
  notes?: string | null;
}

export interface ManualEntriesMessage {
  /** Spaces the caller may act in; null = org-wide, [] = none. */
  scopeSpaceIds?: AttendanceScope;
  editorId: string;
  organizationId: string;
  userId: string;
  locationId: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD" (inclusive)
  weekdays?: number[]; // 0=Sun..6=Sat; ignored for a single-day add
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  /*
    The break as the dialogs now describe it: wall-clock times inside the
    shift, with a type and a reason — the same shape the edit dialog sends.

    ⚠️ `breakMinutes` is still accepted. Older clients send it, and a phone that
    has not taken the update must not start failing; it becomes the same break,
    centred, which is what this service already did.
  */
  breakStart?: string;
  breakEnd?: string;
  breakType?: 'SHORT' | 'LUNCH' | 'OTHER';
  breakReason?: string;
  breakMinutes?: number;
  notes?: string;
  reason?: string;
}
