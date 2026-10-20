/** task-service: the message types its handlers read. */
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

/**
 * Who is acting on the register, and in which workspaces — as the gateway's
 * `assetActor` builds it from the verified session.
 *
 * Each level is a workspace list with three states: `null` = org-wide, an
 * array = only those workspaces, `[]` = nowhere. ⚠️ A level that is MISSING is
 * read as nowhere, never as everywhere: a caller that forgot to forward it (a
 * new route, a queue job built by hand) must lose access, not gain the whole
 * organization's register. That is the opposite of what `undefined` used to
 * mean on the contract flow, and it is the safe one.
 */
export interface AssetActorMessage {
  userId: string;
  userRole: string;
  organizationId: string;
  /** A client's or partner's person — holds no custody, whatever the rows say. */
  isExternal?: boolean;
  /** Read records, their history, money, custody and logbook. */
  viewSpaceIds?: string[] | null;
  /** Add logbook entries and file expenses. */
  logSpaceIds?: string[] | null;
  /** Create, edit, delete, hand over, money rows, contracts, proposals. */
  manageSpaceIds?: string[] | null;
  /**
   * Manages assets ORG-WIDE. Read by the shared entry-date rule (the
   * backdating exemption) and by "may name somebody else as the holder" —
   * both org-wide by definition, so a workspace grant never satisfies them.
   */
  canManageAssets?: boolean;
}

/** What a client sends: the reading, after a person has corrected it. */
export interface ContractFieldsMessage {
  name?: string;
  registration?: string;
  vin?: string;
  serial?: string;
  manufacturer?: string;
  model?: string;
  startsOn?: string;
  endsOn?: string;
}

/** The person acting on a chat group. */
export type ChatActorMessage = { userId: string; organizationId: string };

/**
 * What the caller may change about people in THIS workspace, decided at the
 * gateway from the route's space (`mayAddSpaceMembers`, `mayGrantSpaceRoles`,
 * `mayManageSpaceMembers`) and enforced here, where the role's kind is known.
 * Absent = all three (internal callers and tests that predate the split).
 */
export interface SpaceMemberAuthorityMessage {
  /** Put a person into the workspace, or take them off it. */
  addMembers: boolean;
  /** Choose the MANAGEMENT role somebody holds here (the ceiling still applies). */
  grantRoles: boolean;
  /** Trades, billing terms and routing — `canManageUsers` here; never an external member. */
  manageTerms: boolean;
}

export type ReportGranularityMessage = 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export type ReportDatePresetMessage =
  'last_7d' | 'last_30d' | 'last_90d' | 'this_month' | 'last_month' | 'this_year' | 'all';

export interface ReportFilterMessage {
  field: string; // dimension key
  op: 'eq' | 'neq' | 'in';
  value: string | number | Array<string | number>;
}

export interface ReportDefinitionMessage {
  dataset: string;
  measures: string[];
  dimensions?: string[];
  granularity?: ReportGranularityMessage;
  dateRange?: { preset?: ReportDatePresetMessage; from?: string; to?: string };
  filters?: ReportFilterMessage[];
  sort?: { key: string; dir: 'asc' | 'desc' };
  limit?: number;
}

export type ReportCadenceMessage = 'daily' | 'weekly' | 'monthly';

export interface ReportScheduleInputMessage {
  cadence: ReportCadenceMessage;
  hour?: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  recipients: string[];
  isActive?: boolean;
}

export type SupportAttachmentMessage = { fileName: string; fileUrl: string; fileType: string; fileSize: number };

/** What every planning item (an epic, a phase) carries. */
export interface PlanningItemInputMessage {
  name?: string;
  description?: string;
  color?: string;
  startDate?: string;
  position?: number;
}
