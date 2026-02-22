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
  technicianType?: string;
  workMode?: string;
  specialty?: string;
  maxDailyJobs?: number;
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
  technicianType?: string;
  workMode?: string;
  specialty?: string;
  expiresAt?: string;
  message?: string;
}

// Create invitation input
export interface CreateInvitationInput {
  targetRole: string;
  expiresInHours?: number;
  technicianType?: string;
  workMode?: string;
  specialty?: string;
  maxDailyJobs?: number;
}

// Accept invitation input (from mobile/web registration)
export interface AcceptInvitationInput {
  code: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}
