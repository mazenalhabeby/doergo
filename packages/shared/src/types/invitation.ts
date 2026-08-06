import type { AccessPersisted } from './modules';

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
  /** Customer-portal invite (targetRole=CUSTOMER): the Customer + optional unit. */
  customerId?: string;
  unitId?: string;
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
