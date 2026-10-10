

/**
 * Runtime shape of `/onboarding/status`. The API flattens the pending request
 * (organizationName, status, rejectionReason) rather than returning the full
 * JoinRequest relation, so this differs from the shared OnboardingStatus type.
 */
export interface OnboardingStatusResult {
  needsOnboarding: boolean;
  hasPendingJoinRequest: boolean;
  pendingRequest: {
    id: string;
    organizationName: string;
    message?: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
    rejectionReason?: string | null;
  } | null;
}
