/**
 * Invitation Constants
 *
 * Centralized constants for the invitation system.
 */

// Code generation
/**
 * Invitation code length.
 *
 * Raised 6 → 10 (audit A-B1). At 6 characters over a 32-symbol alphabet the
 * keyspace is 32^6 ≈ 1.07e9 (~2^30), and an invitation code is a BEARER
 * credential: there is no email column on Invitation, so whoever presents the
 * code becomes a member of that organization — no approval step, unlike the
 * org join code.
 *
 * The rate limits (10/min validate, 5/min accept) are per IP and held in
 * process memory, so they multiply with both the attacker's proxy pool and the
 * gateway's replica count. Against ~200 live invitations platform-wide, a
 * 500-IP pool expects a hit in roughly 18 hours. At 10 characters the same
 * pool needs ~2,000 years.
 *
 * Ten characters is still typeable, and existing 6-character codes keep working
 * — validation is a hash lookup, and the accept DTO still accepts a 6 minimum.
 */
export const INVITATION_CODE_LENGTH = 10;
export const INVITATION_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes I, O, 0, 1 to avoid confusion

// Expiration
export const INVITATION_DEFAULT_EXPIRY_HOURS = 72; // 3 days
export const INVITATION_MAX_EXPIRY_HOURS = 720; // 30 days
export const INVITATION_MIN_EXPIRY_HOURS = 1;

// Rate limits
export const INVITATION_MAX_PENDING_PER_ORG = 50;
