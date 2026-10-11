

import type { LeavePolicyFields } from './leave-ledger';

// ============================================================================
// ORGANIZATIONS API
// ============================================================================

// Organization member type
export interface OrgMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  /** The company that employs them; null = the main one. */
  employerEntityId?: string | null;
  /** Owns the organization. Cannot be removed or demoted until ownership moves. */
  isOwner?: boolean;
  avatarUrl?: string | null;
  createdAt: string;
  // Mobile Access Profile (JSON, e.g. { modules: ["tasks","clock"] }). Used to
  // tell whether a member can actually receive/see tasks.
  enabledModules?: unknown;
  workMode?: string;
  specialty?: string;
  presence?: string | null;
  contactable?: boolean;
  contactScope?: string;
  contactAllowedIds?: string[];
  allowRemote?: boolean;
  lastActiveAt?: string | null;
  position: string | null;
  scheduleType: string | null;
  monthlyHourBudget: number | null;
  canCreateTasks: boolean;
  taskCreationScope?: string;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  canViewReports?: boolean;
  /** 'IN_HOUSE' | 'EXTERNAL' — field seat pricing. */
  employmentType?: string | null;
  maxDailyJobs?: number | null;
  /** Unified org-wide role (AccessRole id) — e.g. Manager. */
  memberRoleId?: string | null;
  memberRole?: { id: string; name: string; color?: string | null } | null;
  /**
   * Works for a client or partner, not for this organization. A different axis
   * from `employmentType`, which prices a FIELD seat — a freelancer is
   * "EXTERNAL" there and is still entirely ours. WHICH company is not stored:
   * they are assigned to exactly one workspace and it already names the client.
   */
  isExternal?: boolean;
  /** Date of birth, YYYY-MM-DD. Absent when the record holds none. */
  dateOfBirth?: string | null;
}


export interface AccessRole {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  scope: string;
  isSystem: boolean;
  permissions?: Record<string, boolean>;
  /** Active members holding this role. Absent on older servers — treat as 0. */
  memberCount?: number;
}


export interface UpdateMemberInput {
  /** Login email — unique across all users. Only send it when it changed. */
  email?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  /** The company that employs them (Settings › Companies); null = the main one. */
  employerEntityId?: string | null;
  scheduleType?: string;
  monthlyHourBudget?: number;
  role?: string;
  canCreateTasks?: boolean;
  taskCreationScope?: string;
  canViewAllTasks?: boolean;
  canAssignTasks?: boolean;
  canManageUsers?: boolean;
  canViewReports?: boolean;
  /** Org-wide role id (AccessRole), or null to clear. */
  memberRoleId?: string | null;
  /** Per-user Access Profile object, or a legacy module string[]. */
  enabledModules?: Record<string, unknown> | string[];
  contactable?: boolean;
  contactScope?: string;
  contactAllowedIds?: string[];
  allowRemote?: boolean;
  /** YYYY-MM-DD, or null to clear it. */
  dateOfBirth?: string | null;
}


export interface MemberWatcher {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
}



/**
 * The organization as its settings screen edits it.
 *
 * Every field here is one the settings page reads; typing them turned four
 * `Record<string, any>` calls into something a rename can break at build time
 * rather than at the customer.
 */
export interface OrganizationProfile extends LeavePolicyFields {
  id?: string;
  name?: string | null;
  description?: string | null;
  industry?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  timezone?: string | null;
  logoUrl?: string | null;
  /** `address` is the older single-line form kept for records that predate the split. */
  address?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  vatId?: string | null;
  billableRateCents?: number | null;
  costRateCents?: number | null;
  /** First day a changed rate applies, `YYYY-MM-DD`; default today. Write-only. */
  rateEffectiveFrom?: string;
  usesExternalWorkers?: boolean | null;
  /** Crew rules: only a job's leader moves its step (shared tasks/crew.ts). */
  crewMode?: boolean | null;
  /** What the organization pays in (ISO code). */
  currency?: string | null;
  enabledModules?: string[] | null;
  notificationPrefs?: Record<string, boolean> | null;
  securitySettings?: Record<string, boolean | number> | null;
}


/** One line added to an existing invoice. */
/** A worker's statement — see `organizationsApi.getStatement`. */
export interface MemberStatement {
  member: { id: string; name: string };
  organizationName: string | null;
  from: string | null;
  to: string | null;
  currency: string;
  lines: Array<{
    spaceId: string | null;
    spaceName: string | null;
    hours: number;
    rateCents: number | null;
    rateLevel: 'contract' | 'member' | 'client' | 'organization' | null;
    amountCents: number;
    jobs: number;
    fromDay: string;
    toDay: string;
    /** `hours` = job hours; `days` = counted time on the days worked (billed by the day here). */
    basis?: 'hours' | 'days';
    /** `days` lines: how many days the run covers. */
    days?: number;
  }>;
  /** Days on site, per workspace id. */
  daysBySpace: Record<string, number>;
  totalHours: number;
  totalCents: number;
  missingRate: boolean;
}
