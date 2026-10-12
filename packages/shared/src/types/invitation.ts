import type { AccessPersisted } from './modules';
import type { PermissionSet } from './permissions';

// Invitation status enum (mirrors Prisma enum)
export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

// Invitation interface (API response shape)
export interface Invitation {
  id: string;
  code?: string | null;
  targetRole: string;
  /** Invited as a client's or partner's person, not as one of the org's own. */
  isExternal?: boolean;
  organizationId: string;
  status: InvitationStatus;
  expiresAt: string;
  usedAt?: string;
  acceptedById?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  // Technician-specific

  workMode?: string;
  specialty?: string;
  maxDailyJobs?: number;
  spaceId?: string | null;
  /** An external invitation's own set of workspace permissions (instead of a shared role). */
  spacePermissions?: PermissionSet | null;
  // Populated relations
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  acceptedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  organization?: {
    id: string;
    name: string;
  };
}

// Invitation validation result (returned by validate endpoint)
export interface InvitationValidation {
  valid: boolean;
  targetRole?: string;
  organizationName?: string;
  /** Joining as a client's or partner's person, not as one of the org's own. */
  isExternal?: boolean;

  workMode?: string;
  specialty?: string;
  expiresAt?: string;
  message?: string;
}

// Create invitation input
export interface CreateInvitationInput {
  targetRole: string;
  expiresInHours?: number;
  email?: string;

  position?: string;
  scheduleType?: string;
  schedule?: { dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }[];
  monthlyHourBudget?: number;
  workMode?: string;
  specialty?: string;
  maxDailyJobs?: number;
  /** Pre-assigned space (CompanyLocation id) — user is assigned to it on accept. */
  spaceId?: string;
  /** Pre-assigned org role (AccessRole id) — applied to the member on accept. */
  memberRoleId?: string;
  /** Invite somebody who works for a client or partner. Mutually exclusive with memberRoleId. */
  isExternal?: boolean;
  /**
   * An external member's own permissions in `spaceId` (the permission builder),
   * instead of a shared `memberRoleId`. Validated at create, applied on accept.
   */
  spacePermissions?: PermissionSet;
  /** Customer-portal invite (targetRole=CUSTOMER): the Customer + optional unit. */
  customerId?: string;
  unitId?: string;
  /** …or one ASSET, for any type whose records a client may hold. */
  assetId?: string;
  /**
   * Pre-configured Access Profile applied to the member on accept, so their
   * first screen already matches their final access (no post-registration
   * "screen change"). Produced by `serializeAccessDraft`.
   */
  accessProfile?: AccessPersisted;
}

// Accept invitation input (from mobile/web registration)
export interface AcceptInvitationInput {
  code: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}
