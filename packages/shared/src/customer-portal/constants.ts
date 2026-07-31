/**
 * @hbcfield/shared — customer-portal constants.
 */

/** Feature-module key used by ModuleGuard / org.enabledModules for the portal. */
export const CUSTOMER_PORTAL_MODULE = 'customer_portal';

/** Default lifetime of a customer invite (magic link / code). */
export const CUSTOMER_INVITE_DEFAULT_EXPIRY_HOURS = 168; // 7 days
export const CUSTOMER_INVITE_MAX_EXPIRY_HOURS = 720; // 30 days

/** Max photos a customer may attach to a single request. */
export const CUSTOMER_REQUEST_MAX_PHOTOS = 6;

export const PREFERRED_TIMES = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
export const CONTACT_PREFERENCES = ['PUSH', 'EMAIL', 'PHONE'] as const;
