/**
 * Which of the member emails a person receives — one rule, read by the sender
 * and by both settings screens.
 *
 * Three emails existed, translated, and were never sent: "a task was assigned
 * to you", "a task you created was completed" and "your shift was closed
 * automatically". Switching them on is only safe with two hands on the tap:
 *
 *  · the ORGANIZATION'S switch is the CEILING. An admin who does not want the
 *    company emailing its people about task work turns it off once, and no
 *    member setting can turn it back on for themselves.
 *  · the MEMBER'S own switch is an OPT-OUT underneath it. Somebody who lives in
 *    the app does not need their inbox to repeat it.
 *
 * ⚠️ MISSING MEANS ON, at both levels. The organization JSON has never been
 * written by most organizations (the Settings save was refused by the gateway
 * for as long as it existed), and a member who never opened their settings has
 * no keys at all. Reading "absent" as "off" would leave the feature switched on
 * in code and silent for everybody — the exact state it is being taken out of.
 * Only an explicit `false` stops an email.
 *
 * The keys live beside the push/category opt-outs in `User.notificationPrefs`
 * (`{ attendance: false }` and friends) under names that cannot collide with a
 * category, so no new column and no migration.
 */

export const MEMBER_EMAILS = ['taskAssigned', 'taskCompleted', 'autoClockOut'] as const;
export type MemberEmail = (typeof MEMBER_EMAILS)[number];

/** The organization's switch for each email, in `Organization.notificationPrefs`. */
export const ORG_EMAIL_SWITCH: Readonly<Record<MemberEmail, string>> = {
  taskAssigned: 'emailOnTaskAssigned',
  // The key the Settings screen has always written; kept so a saved choice survives.
  taskCompleted: 'emailOnTaskComplete',
  autoClockOut: 'emailOnAutoClockOut',
};

/** The member's own switch for each email, in `User.notificationPrefs`. */
export const MEMBER_EMAIL_PREF: Readonly<Record<MemberEmail, string>> = {
  taskAssigned: 'emailTaskAssigned',
  taskCompleted: 'emailTaskCompleted',
  autoClockOut: 'emailAutoClockOut',
};

/**
 * Every key the organization's notification settings may hold. The gateway
 * validates against this and the service stores nothing else — the JSON is not
 * a place for a client to park arbitrary data.
 */
export const ORG_NOTIFICATION_PREF_KEYS = [
  ...Object.values(ORG_EMAIL_SWITCH),
  'emailOnJoinRequest',
  'pushEnabled',
] as const;

/**
 * Every key a member's own notification settings may hold: the category
 * opt-outs the routing already reads (`attendance`, `tasks`), the phone's
 * time-off category, and the three emails.
 */
export const MEMBER_NOTIFICATION_PREF_KEYS = [
  'attendance',
  'tasks',
  'timeOff',
  ...Object.values(MEMBER_EMAIL_PREF),
] as const;

function explicitlyOff(prefs: unknown, key: string): boolean {
  return !!prefs && typeof prefs === 'object' && (prefs as Record<string, unknown>)[key] === false;
}

/** Does the organization allow this email at all? Unset = yes. */
export function orgAllowsEmail(orgPrefs: unknown, kind: MemberEmail): boolean {
  return !explicitlyOff(orgPrefs, ORG_EMAIL_SWITCH[kind]);
}

/** Has the member kept this email? Unset = yes. */
export function memberWantsEmail(memberPrefs: unknown, kind: MemberEmail): boolean {
  return !explicitlyOff(memberPrefs, MEMBER_EMAIL_PREF[kind]);
}

/** The ceiling AND the opt-out. */
export function emailAllowed(orgPrefs: unknown, memberPrefs: unknown, kind: MemberEmail): boolean {
  return orgAllowsEmail(orgPrefs, kind) && memberWantsEmail(memberPrefs, kind);
}

/**
 * Keep only `key → boolean` pairs from a client-supplied object, and only for
 * the keys named. Anything else — a nested object, a string "false", a key
 * nobody reads — is dropped rather than stored.
 */
export function pickBooleanPrefs(input: unknown, allowed: readonly string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of allowed) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/**
 * An address worth handing to SMTP.
 *
 * Accounts have no verification flag to consult, so this refuses what can never
 * be delivered: no `@`, whitespace, and the reserved names (RFC 2606/6761) that
 * imports and tests use for "no real address". Sending to those costs a bounce
 * each, and bounces are what get a sending domain throttled for everybody.
 */
export function isDeliverableAddress(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const value = email.trim().toLowerCase();
  if (value.length > 254 || /\s/.test(value)) return false;
  const domain = /^[^@]+@([^@]+\.[a-z0-9-]{2,})$/.exec(value)?.[1];
  if (!domain) return false;
  return !/\.(invalid|test|localhost|local|example)$/.test(domain);
}
