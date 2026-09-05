/**
 * An organization's off switch.
 *
 * `Organization.suspendedAt` is set by an operator on admin.hbcfield.com and is
 * the one control that takes a whole company off the product — for non-payment,
 * for abuse, or at the customer's own request.
 *
 * ⚠️ It used to mean something much weaker. Suspension only mapped the org's
 * subscription status to `canceled`, which the billing lock reads: writes were
 * refused, reads were not. Everyone could still sign in and browse everything.
 * That is the right behaviour for an unpaid invoice — you do not lock a team out
 * of its own data over a card that expired — but it is not what "deactivate"
 * means to the operator pressing the button, and the gap between the label and
 * the effect is the dangerous part.
 *
 * So the meaning is stated here, once, and enforced on all three doors into the
 * product: sign-in, token refresh, and per-request validation. The billing lock
 * stays exactly as it was, for the case it was built for.
 *
 * Reversible by design: it is one nullable timestamp, and clearing it restores
 * the organization untouched. Nothing is deleted, nothing is billed differently
 * — suspension is about access, and the bill is a separate decision an operator
 * makes in the same panel.
 */
export interface SuspendableOrganization {
  suspendedAt?: Date | string | null;
}

/** Is this organization switched off? Null-safe: no organization is not suspended. */
export function isOrganizationSuspended(org: SuspendableOrganization | null | undefined): boolean {
  return Boolean(org?.suspendedAt);
}

/**
 * Machine-readable reason, so a client can tell "we switched you off" apart from
 * "your password is wrong" without parsing prose.
 */
export const ORG_SUSPENDED_CODE = 'ORGANIZATION_SUSPENDED';

/**
 * What the member reads.
 *
 * It names no reason — an operator suspends for arrears, for abuse, or because
 * the customer asked, and guessing wrong in the sign-in box is worse than saying
 * nothing. It points at the one route that can actually resolve it.
 */
export const ORG_SUSPENDED_MESSAGE =
  'This organization is currently deactivated. Please contact HBCField support.';
