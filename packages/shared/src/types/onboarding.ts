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

// Create organization input (onboarding Path A)
export interface CreateOrganizationInput {
  name: string;
  address?: string;
  industry?: string;
}

// Submit join request input (onboarding Path B)
export interface SubmitJoinRequestInput {
  orgCode: string;
  message?: string;
}

// Approve join request input (admin action)
export interface ApproveJoinRequestInput {
  role: string;
  platform?: string;
  technicianType?: string;
  workMode?: string;
  specialty?: string;
  maxDailyJobs?: number;
}

// Reject join request input (admin action)
export interface RejectJoinRequestInput {
  reason?: string;
}

// Onboarding status response
export interface OnboardingStatus {
  needsOnboarding: boolean;
  hasPendingJoinRequest: boolean;
  pendingRequest?: JoinRequest;
}
