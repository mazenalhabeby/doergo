/**
 * Answer shapes BOTH apps declared for themselves — one definition now.
 *
 * Each was copied from apps/web-app/src/lib/api.ts and apps/mobile/src/lib/api
 * and merged: a field both copies declare keeps its type; a field only one copy
 * declares is optional here (the server sends it; one screen happened to read
 * it). Types that already lived in this package (Task, TimeEntry, Comment,
 * JoinRequest, MemberDocument…) are reused by the endpoint table, never
 * redefined here.
 */
import type { CalendarItem, CalendarPlace, EventVisibility, RsvpResponse } from '../calendar/types';
import type { Repeat } from '../calendar/recurrence';
import type { DayKind } from '../calendar/days';
import type { CompanyLocation } from '../types';

/** A person as most answers name one. */
export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

// ── tasks: time, crew, hand-over, role pool ──────────────────────────────────

export interface JobTimeSplit {
  travel: number;
  working: number;
  blocked: number;
}

export interface CrewView {
  /** The organization's crew rules: only the leader moves the job's step. */
  crewMode: boolean;
  leader: { userId: string | null; acting: boolean; source: 'TODAY' | 'LEAD' | 'ACTING' | 'NONE' };
  /** A lead handed over for today, while it lasts. */
  today: { userId: string; until: string } | null;
  members: Array<{
    user: PersonRef;
    role: 'LEAD' | 'MEMBER';
    joined: boolean;
    since: string | null;
    /** When they last left the job — null if they never joined it. */
    lastLeftAt?: string | null;
    selfBlockedSince: string | null;
    selfBlockReason: string | null;
    onClock: boolean;
  }>;
}

export interface JobTimeView {
  asOf: string;
  total: JobTimeSplit;
  /** `live`: what that person's time is running as now — their own stop makes it blocked. */
  byWorker: Array<JobTimeSplit & { user: PersonRef; live?: keyof JobTimeSplit | null }>;
  /** Who is on the crew now, and who leads (shared tasks/crew.ts). */
  crew?: CrewView | null;
  /** Running now: a screen may tick it forward from `asOf`. */
  live: { kind: keyof JobTimeSplit; workers: number } | null;
  /** The first move into counted time — and, when the office made it for somebody, who and why. */
  startedBy: { user: PersonRef | null; forUser: PersonRef | null; office: boolean; reason: string | null; at: string } | null;
}

export interface TaskHandover {
  id: string;
  note: string;
  attachmentIds: string[];
  workedMinutes: number | null;
  createdAt: string;
  author: PersonRef;
}

export interface OpenRoleTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  openedAt: string | null;
  openSpots: number | null;
  openSpotsLeft: number | null;
  roleId: string | null;
  roleName: string | null;
  spaceId: string | null;
  spaceName: string | null;
  locationAddress: string | null;
  distanceKm: number | null;
}

/** What `/tasks/:id/attachments/presign` (and the other presign routes) answer. */
export interface PresignedUpload {
  uploadUrl: string;
  fileKey: string;
  fileUrl?: string;
  expiresIn: number;
  maxFileSize: number;
}

// ── attendance: work log, shift issues, overtime ─────────────────────────────

export interface WorkLogAttachment {
  id: string;
  fileKey: string;
  fileUrl: string;
  url?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  createdAt: string;
}

export interface WorkLogNote {
  id: string;
  timeEntryId: string;
  userId: string;
  body: string;
  at: string;
  taskId?: string | null;
  attachments: WorkLogAttachment[];
  createdAt: string;
  /** Who wrote it (member or manager). */
  author?: { id: string; name: string };
  /** A manager/admin wrote it, not the session's member. */
  byManager?: boolean;
}

export type ShiftIssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELED';
export type ShiftIssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface ShiftIssueEvent {
  id: string;
  type: string;
  actorId?: string | null;
  actorName?: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
  attachments?: Array<Partial<WorkLogAttachment> & { fileUrl: string; fileName: string; mimeType: string }>;
  at: string;
}

export interface ShiftIssue {
  id: string;
  organizationId?: string;
  title: string;
  description?: string | null;
  severity: ShiftIssueSeverity;
  status: ShiftIssueStatus;
  reportedById: string;
  reporterName?: string;
  assignedToId?: string | null;
  assigneeName?: string | null;
  spaceId?: string | null;
  timeEntryId?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
  updatedAt: string;
  eventCount?: number;
  thread?: ShiftIssueEvent[];
}

export interface OvertimeRequest {
  id: string;
  technicianId: string;
  timeEntryId: string;
  locationId: string;
  status: string;
  technicianRespondedAt?: string;
  technicianReason?: string;
  approvalMethod?: 'REMOTE' | 'SIGNATURE' | string;
  approvedById?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  leaderName?: string;
  leaderSignature?: string;
  maxDurationMinutes?: number;
  overtimeStartAt?: string;
  overtimeEndAt?: string;
  actualEndAt?: string;
  overtimeMinutes?: number;
  organizationId: string;
  createdAt: string;
  updatedAt?: string;
  technician?: { id: string; firstName: string; lastName: string; email?: string };
  location?: { id: string; name: string; timezone?: string | null };
  approvedBy?: { id: string; firstName: string; lastName: string };
  /** The member's own read: the shift it belongs to. */
  timeEntry?: { clockInAt: string; clockOutAt: string | null; expectedClockOutAt: string | null };
  /** PENDING_APPROVAL (the member's own read): who it waits for — first names, and how many more. */
  askedOf?: { names: string[]; more: number };
}

// ── people & places ──────────────────────────────────────────────────────────

export interface OrgMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  platform?: string;
  avatarUrl?: string | null;
  position?: string | null;
  specialty?: string | null;
  /** The Access Profile blob — read through the shared access helpers. */
  enabledModules?: unknown;
  presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | string | null;
  lastActiveAt?: string | null;
  memberRoleId?: string | null;
  /** The organization role this member holds — its own name and colour. */
  memberRole?: { id: string; name: string; color?: string | null } | null;
  /** Works for a client or partner, not for this organization. */
  isExternal?: boolean;
  isOwner?: boolean;
  employerEntityId?: string | null;
  workMode?: string;
  contactable?: boolean;
  contactScope?: string;
  contactAllowedIds?: string[];
  allowRemote?: boolean;
  scheduleType?: string | null;
  monthlyHourBudget?: number | null;
  taskCreationScope?: string;
  canViewReports?: boolean;
  employmentType?: string | null;
  maxDailyJobs?: number | null;
  dateOfBirth?: string | null;
}

/** A colleague as the team list and the managers list name them. */
export interface Colleague {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  position?: string | null;
  role?: string;
  spaceName?: string | null;
  presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null;
  /** "Show in Management" — surfaces this member in the Managers group. */
  contactable?: boolean;
}

export interface LocationAssignment {
  id: string;
  userId: string;
  locationId: string;
  isPrimary: boolean;
  schedule?: string[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  createdAt?: string;
  updatedAt?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl?: string | null;
    workMode?: string;
    isExternal?: boolean;
    enabledModules?: unknown;
  };
  location?: CompanyLocation;
  /** The member's current active task at this location (server-computed presence). */
  currentTask?: string | null;
  currentTaskStatus?: string | null;
}

// ── assets ───────────────────────────────────────────────────────────────────

/** What a contract was read as — six confirmed fields travel, nothing else. */
export interface ContractFields {
  name?: string;
  registration?: string;
  vin?: string;
  serial?: string;
  manufacturer?: string;
  model?: string;
  startsOn?: string;
  endsOn?: string;
}

// ── calendar ─────────────────────────────────────────────────────────────────

export interface CalendarRange {
  from: string;
  to: string;
  timezone: string;
  places: CalendarPlace[];
  days: { day: string; kind: DayKind }[];
  items: CalendarItem[];
}

export interface CalendarAttendee {
  userId: string;
  response: RsvpResponse;
  isOrganizer: boolean;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

export interface CalendarEventDetail {
  id: string;
  kind: 'APPOINTMENT' | 'REMINDER';
  title: string;
  description: string | null;
  location: string | null;
  meetingUrl: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  repeat: Repeat | null;
  reminders: number[];
  visibility: EventVisibility;
  canceled: boolean;
  space?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
  /** How and where (shared calendar/meeting.ts). */
  meetingMode?: 'IN_PERSON' | 'ONLINE' | 'PHONE' | null;
  placeKind?: 'OFFICE' | 'CLIENT_SITE' | 'ADDRESS' | null;
  placeSpace?: { id: string; name: string; address: string | null; lat: number | null; lng: number | null } | null;
  room?: string | null;
  phone?: string | null;
  callDirection?: 'OUTGOING' | 'INCOMING' | null;
  organizerId: string;
  canEdit: boolean;
  myResponse: RsvpResponse;
  attendees: CalendarAttendee[];
}

export interface CalendarEventInput {
  /** A client-made id, so a retried create is the same event. */
  id?: string;
  kind?: 'APPOINTMENT' | 'REMINDER';
  title?: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  customerId?: string | null;
  spaceId?: string | null;
  allDay?: boolean;
  startAt?: string;
  endAt?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  repeat?: Repeat | null;
  reminders?: number[];
  visibility?: EventVisibility;
  attendeeIds?: string[];
  meetingMode?: 'IN_PERSON' | 'ONLINE' | 'PHONE' | null;
  placeKind?: 'OFFICE' | 'CLIENT_SITE' | 'ADDRESS' | null;
  placeSpaceId?: string | null;
  room?: string | null;
  phone?: string | null;
  callDirection?: 'OUTGOING' | 'INCOMING' | null;
}

export interface CalendarPerson {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  position?: string | null;
}

// ── support ──────────────────────────────────────────────────────────────────

export interface SupportConfig {
  tier: string | null;
  slaBusinessMinutes: number;
  liveChat: boolean;
  priorityRouting: boolean;
  dedicatedSupport: boolean;
}
