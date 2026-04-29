// Overtime request constants

export const OVERTIME_CONSTANTS = {
  // Timeout windows
  TECHNICIAN_RESPONSE_TIMEOUT_MS: 15 * 60 * 1000,  // 15 minutes for tech to respond
  APPROVAL_TIMEOUT_MS: 10 * 60 * 1000,              // 10 minutes for leader to approve
  CHECK_INTERVAL_MS: 60 * 1000,                      // Check timeouts every 1 minute

  // Duration limits
  MAX_OVERTIME_DURATION_MINUTES: 480,                 // 8 hours hard cap
  DEFAULT_OVERTIME_DURATION_MINUTES: 120,             // 2 hours default

  // Job IDs
  OVERTIME_TIMEOUT_JOB_ID: 'overtime-timeout-checker',
} as const;

// Status enum (mirrors Prisma enum for frontend use)
export const OvertimeRequestStatus = {
  PENDING_TECHNICIAN: 'PENDING_TECHNICIAN',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED_NO_RESPONSE: 'EXPIRED_NO_RESPONSE',
  EXPIRED_NO_APPROVAL: 'EXPIRED_NO_APPROVAL',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
} as const;

export type OvertimeRequestStatusType = typeof OvertimeRequestStatus[keyof typeof OvertimeRequestStatus];

export const OvertimeApprovalMethod = {
  REMOTE: 'REMOTE',
  SIGNATURE: 'SIGNATURE',
} as const;

export type OvertimeApprovalMethodType = typeof OvertimeApprovalMethod[keyof typeof OvertimeApprovalMethod];
