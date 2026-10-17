/** Answer shapes about people and their shifts: shift issues, overtime, members, colleagues, assignments, contract fields. */
import type { CompanyLocation } from '../../types';
import type { WorkLogAttachment } from './tasks';

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
  /** May the caller message them — chat's own rule, added by the gateway. */
  canMessage?: boolean;
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
