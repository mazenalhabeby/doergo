/**
 * May this person clock in for this workspace without standing in it?
 *
 * Two questions, and an earlier design collapsed them into one:
 *
 *   "Can anyone be away from this site at all?"  — a fact about the PLACE
 *   "May this person be?"                        — a decision about a PERSON
 *
 * Answering the first does not answer the second. A workspace set to allow it
 * would otherwise hand remote clock-in to everyone who works there, the packer
 * as well as the seller. So a CEILING on the workspace and a GRANT on the
 * person, and neither alone is enough — the same shape this product already uses
 * for space roles, where a grant can never exceed what the granter holds.
 *
 * Pure, and the only implementation. The clock-in refuses through it, the phone
 * decides whether to offer the choice through it, and the settings screens
 * explain themselves with it — so what a member is offered and what the server
 * will accept cannot drift apart.
 */

/** What a workspace permits. A fact about the site, not about anybody. */
export const GEOFENCE_POLICIES = ['STRICT', 'AWAY_ALLOWED', 'NONE'] as const;
export type GeofencePolicy = (typeof GEOFENCE_POLICIES)[number];

/**
 * The default, and it is today's behaviour exactly: a site with coordinates
 * requires you to be inside them. Every existing workspace starts here, so
 * nothing changes anywhere until somebody decides otherwise.
 */
export const DEFAULT_GEOFENCE_POLICY: GeofencePolicy = 'STRICT';

export function isGeofencePolicy(v: unknown): v is GeofencePolicy {
  return typeof v === 'string' && (GEOFENCE_POLICIES as readonly string[]).includes(v);
}

/**
 * Why the answer is what it is.
 *
 * Carried rather than derived at the point of display, because a member refused
 * while standing outside a client's office should be told WHICH of the three
 * reasons it was — "you are not allowed" and "this site never allows it" send
 * them to different people to get it fixed.
 */
export type AwayVerdict =
  /** The workspace has no ring to be outside of. Nothing to permit. */
  | 'NO_GEOFENCE'
  /** The site requires presence, whatever the person's account says. */
  | 'SITE_STRICT'
  /** The site permits it; this person has not been granted it. */
  | 'NOT_GRANTED'
  /** Both halves agree. */
  | 'GRANTED';

export interface AwayAccessInput {
  /** Whether the workspace has coordinates at all. No pin, no ring. */
  spaceHasPin: boolean;
  /** The workspace's ceiling. Unknown values fall back to the safe default. */
  policy?: string | null;
  /** The account-level grant (`User.allowRemote`). */
  userAllowRemote?: boolean | null;
  /**
   * The per-workspace override on the member's assignment.
   *
   * `null`/`undefined` means FOLLOW THE ACCOUNT, which is what every assignment
   * starts as — so nobody has to fill anything in to keep what they have. Only
   * an explicit `true` or `false` overrides.
   */
  assignmentAllowRemote?: boolean | null;
  /**
   * An administrator needs no explicit grant — there is nothing for them to
   * configure and nobody above them to ask.
   *
   * ⚠️ This satisfies the GRANT and never the CEILING. An admin cannot clock in
   * away from a site that requires presence, because that is a statement about
   * the site rather than a privilege anybody holds.
   */
  isAdmin?: boolean;
}

export interface AwayAccess {
  allowed: boolean;
  reason: AwayVerdict;
}

export function resolveAwayAccess(input: AwayAccessInput): AwayAccess {
  const policy: GeofencePolicy = isGeofencePolicy(input.policy)
    ? input.policy
    : DEFAULT_GEOFENCE_POLICY;

  // Nothing to be away FROM. A pin-less workspace never geofenced anybody, and a
  // workspace whose policy switches the ring off has chosen the same thing.
  if (!input.spaceHasPin || policy === 'NONE') {
    return { allowed: true, reason: 'NO_GEOFENCE' };
  }

  // The ceiling, first and unconditionally.
  if (policy === 'STRICT') {
    return { allowed: false, reason: 'SITE_STRICT' };
  }

  // …then the grant. The assignment overrides the account only when it says
  // something; otherwise the account answers.
  const granted =
    input.assignmentAllowRemote != null
      ? input.assignmentAllowRemote
      : !!input.userAllowRemote || !!input.isAdmin;

  return granted ? { allowed: true, reason: 'GRANTED' } : { allowed: false, reason: 'NOT_GRANTED' };
}

/**
 * Whether a workspace could EVER admit an away clock-in — used to decide whether
 * a screen offers the choice at all, before it knows who is asking.
 */
export function spaceAllowsAway(spaceHasPin: boolean, policy?: string | null): boolean {
  const p: GeofencePolicy = isGeofencePolicy(policy) ? policy : DEFAULT_GEOFENCE_POLICY;
  return !spaceHasPin || p !== 'STRICT';
}
