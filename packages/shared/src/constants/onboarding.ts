/**
 * Onboarding & Join System Constants
 */

import { JoinPolicy, JoinRequestStatus } from '../types/onboarding';

// Org join code generation (reuses invitation charset)
export const ORG_CODE_LENGTH = 8;
export const ORG_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes I, O, 0, 1

// Join request limits
export const JOIN_REQUEST_MAX_PENDING_PER_USER = 3;
export const JOIN_REQUEST_MAX_PENDING_PER_ORG = 100;
export const JOIN_REQUEST_MESSAGE_MAX_LENGTH = 500;

// Helper functions
export function getJoinPolicyLabel(policy: JoinPolicy): string {
  switch (policy) {
    case JoinPolicy.OPEN:
      return 'Open';
    case JoinPolicy.INVITE_ONLY:
      return 'Invite Only';
    case JoinPolicy.CLOSED:
      return 'Closed';
    default:
      return policy;
  }
}

export function getJoinRequestStatusLabel(status: JoinRequestStatus): string {
  switch (status) {
    case JoinRequestStatus.PENDING:
      return 'Pending';
    case JoinRequestStatus.APPROVED:
      return 'Approved';
    case JoinRequestStatus.REJECTED:
      return 'Rejected';
    case JoinRequestStatus.CANCELED:
      return 'Canceled';
    default:
      return status;
  }
}

export function getJoinRequestStatusColor(status: JoinRequestStatus): string {
  switch (status) {
    case JoinRequestStatus.PENDING:
      return 'amber';
    case JoinRequestStatus.APPROVED:
      return 'green';
    case JoinRequestStatus.REJECTED:
      return 'red';
    case JoinRequestStatus.CANCELED:
      return 'slate';
    default:
      return 'slate';
  }
}
