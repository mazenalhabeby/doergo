/**
 * Authentication Constants
 *
 * Centralized auth-related business logic constants.
 * These values control security settings across all services.
 */

// =============================================================================
// SESSION LIMITS
// =============================================================================

/**
 * Maximum number of active sessions per user
 * Prevents unlimited device logins
 */
export const MAX_SESSIONS_PER_USER = 5;

// =============================================================================
// ACCOUNT LOCKOUT
// =============================================================================

/**
 * Maximum failed login attempts before account lockout
 */
export const MAX_FAILED_ATTEMPTS = 5;

/**
 * Duration of account lockout in minutes
 */
export const LOCKOUT_DURATION_MINUTES = 15;

// =============================================================================
// PASSWORD RESET
// =============================================================================

/**
 * Password reset token expiration in hours
 */
export const PASSWORD_RESET_EXPIRATION_HOURS = 1;

// =============================================================================
// TOKEN REFRESH
// =============================================================================

/**
 * Grace period for concurrent refresh token requests in seconds
 * Allows multiple requests to use the same token during this window
 */
export const REFRESH_TOKEN_GRACE_PERIOD_SECONDS = 60;

/**
 * How long an app session lasts when nothing else says so.
 *
 * The code used to fall back to 7 days while production ran 90, set only in
 * compose — so a container started without that variable signed every field
 * worker out after a week, and a phone offline for eight days came back to a
 * login screen with its whole queue waiting. One default, stated once.
 */
export const DEFAULT_REFRESH_TOKEN_TTL = '90d';

// =============================================================================
// PASSWORD REQUIREMENTS
// =============================================================================

/**
 * Minimum password length
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Maximum password length
 */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Bcrypt cost factor for password hashing
 * Higher = more secure but slower
 */
export const BCRYPT_COST_FACTOR = 12;

// =============================================================================
// RATE LIMITING
// =============================================================================

/**
 * Rate limit windows (in seconds)
 */
export const RATE_LIMIT = {
  /** Short burst limit */
  SHORT_WINDOW: 1,
  SHORT_LIMIT: 3,

  /** Medium window limit */
  MEDIUM_WINDOW: 10,
  MEDIUM_LIMIT: 20,

  /** Long window limit */
  LONG_WINDOW: 60,
  LONG_LIMIT: 100,
} as const;
