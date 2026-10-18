// Join policy enum (mirrors Prisma enum)
export enum JoinPolicy {
  OPEN = 'OPEN',
  INVITE_ONLY = 'INVITE_ONLY',
  CLOSED = 'CLOSED',
}

// Join request status enum (mirrors Prisma enum)
export enum JoinRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
}

// Public organization info (safe to return to non-members)
export interface OrganizationPublic {
  id: string;
  name: string;
}

// Join request interface (API response shape)
export interface JoinRequest {
  id: string;
  userId: string;
  organizationId: string;
  message?: string;
  status: JoinRequestStatus;
  reviewedById?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  assignedRole?: string;
  assignedPlatform?: string;
  createdAt: string;
  updatedAt: string;
  // Populated relations
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  reviewedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  organization?: OrganizationPublic;
}

// Org code validation result
export interface OrgCodeValidation {
  valid: boolean;
  organizationName?: string;
  joinPolicy?: JoinPolicy;
  message?: string;
}

// Onboarding status response
export interface OnboardingStatus {
  needsOnboarding: boolean;
  hasPendingJoinRequest: boolean;
  pendingRequest?: JoinRequest;
}
