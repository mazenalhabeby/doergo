/**
 * Invitation Constants
 *
 * Centralized constants for the invitation system.
 */

// Code generation
export const INVITATION_CODE_LENGTH = 6;
export const INVITATION_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes I, O, 0, 1 to avoid confusion

// Expiration
export const INVITATION_DEFAULT_EXPIRY_HOURS = 72; // 3 days
export const INVITATION_MAX_EXPIRY_HOURS = 720; // 30 days
export const INVITATION_MIN_EXPIRY_HOURS = 1;

// Rate limits
export const INVITATION_MAX_PENDING_PER_ORG = 50;
