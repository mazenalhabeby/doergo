/**
 * What the organization expects from a member, and what is still missing.
 *
 * The compliance board was built from DOCUMENTS, so it could only ever show
 * what people had already given: the technician who uploaded nothing at all was
 * invisible on it, which is precisely the person a dispatcher needs to know
 * about. An absence cannot be listed until the expectation exists as a record —
 * that is what a requirement is.
 *
 * Pure. Every surface that asks "what does this person still owe us?" — the
 * member's own screen, the compliance board, the review queue — asks it here,
 * so they cannot answer differently.
 */

import { credentialStanding } from './rules';
import type { CredentialStanding } from './types';

export interface RequirableType {
  id: string;
  label: string;
  direction: 'ISSUED' | 'SUPPLIED';
  isActive: boolean;
  isCredential: boolean;
  hasExpiry: boolean;
  requiredFromAll: boolean;
  requiredFromRoleIds: string[];
  requiredForWorkflowIds?: string[];
}

export interface HeldDocument {
  typeId: string;
  status: string;
  expiresOn: Date | string | null;
}

/** How a member stands against one requirement. */
export type RequirementState =
  /** Nothing on file at all. */
  | 'MISSING'
  /** Sent in, nobody has reviewed it. Does NOT satisfy anything yet. */
  | 'AWAITING_REVIEW'
  /** A reviewer refused the last one; the member has to send another. */
  | 'REJECTED'
  /** Accepted and in date. */
  | 'MET'
  /** Accepted, in date, but not for much longer. */
  | 'EXPIRING'
  /** Accepted and out of date. */
  | 'EXPIRED';

export interface RequirementStatus {
  typeId: string;
  label: string;
  state: RequirementState;
  expiresOn: Date | null;
  /** Somebody cannot be assigned to gated work while this is unmet. */
  blocksWork: boolean;
}

/**
 * The types this member is expected to provide.
 *
 * ONLY supplied types can be required. Requiring a payslip from an employee
 * would be asking them to produce a document the company issues, and a screen
 * that did it would be unanswerable.
 */
export function requirementsFor(
  member: { memberRoleId?: string | null },
  types: RequirableType[],
): RequirableType[] {
  return types.filter((t) => {
    if (!t.isActive || t.direction !== 'SUPPLIED') return false;
    if (t.requiredFromAll) return true;
    return !!member.memberRoleId && t.requiredFromRoleIds.includes(member.memberRoleId);
  });
}

/**
 * Where a member stands on each of them.
 *
 * The ordering of the checks is the whole rule. A REJECTED document does not
 * satisfy a requirement and neither does one AWAITING_REVIEW — but they are
 * different situations for the person: one is waiting on the office, the other
 * is waiting on them. Collapsing both into "missing" would tell somebody to
 * upload a licence they uploaded yesterday.
 */
export function requirementStatuses(
  member: { memberRoleId?: string | null },
  types: RequirableType[],
  held: HeldDocument[],
  now: Date = new Date(),
): RequirementStatus[] {
  return requirementsFor(member, types).map((type) => {
    const mine = held.filter((d) => d.typeId === type.id);

    // Only these two count. The dispatch gate reads the same pair, so a
    // requirement can never read MET for something the gate would refuse.
    const accepted = mine.filter((d) => d.status === 'ISSUED' || d.status === 'SIGNED');
    const gates = (type.requiredForWorkflowIds?.length ?? 0) > 0;

    if (accepted.length > 0) {
      // The one that expires LAST — a renewal beside an old copy is met, not
      // expired, and sorting the other way round would say the opposite.
      const best = accepted
        .map((d) => (d.expiresOn ? new Date(d.expiresOn) : null))
        .sort((a, b) => (b?.getTime() ?? Infinity) - (a?.getTime() ?? Infinity))[0] ?? null;

      const standing: CredentialStanding = credentialStanding(best, now);
      const state: RequirementState =
        standing === 'EXPIRED' ? 'EXPIRED' : standing === 'EXPIRING' ? 'EXPIRING' : 'MET';

      return {
        typeId: type.id,
        label: type.label,
        state,
        expiresOn: best,
        blocksWork: gates && state === 'EXPIRED',
      };
    }

    if (mine.some((d) => d.status === 'PENDING_VERIFICATION')) {
      return { typeId: type.id, label: type.label, state: 'AWAITING_REVIEW', expiresOn: null, blocksWork: gates };
    }
    if (mine.some((d) => d.status === 'REJECTED')) {
      return { typeId: type.id, label: type.label, state: 'REJECTED', expiresOn: null, blocksWork: gates };
    }
    return { typeId: type.id, label: type.label, state: 'MISSING', expiresOn: null, blocksWork: gates };
  });
}

/** The ones that still need something doing. */
export function outstanding(statuses: RequirementStatus[]): RequirementStatus[] {
  return statuses.filter((s) => s.state !== 'MET' && s.state !== 'EXPIRING');
}

/**
 * Whose turn it is.
 *
 * The distinction a member's screen lives on: chasing somebody for a document
 * they already sent is how a product teaches people to ignore it.
 */
export function waitingOnMember(status: { state: RequirementState }): boolean {
  // Takes the STATE alone, not a whole RequirementStatus: the browser reads
  // these off JSON, where `expiresOn` is a string, and a signature demanding
  // the server-side shape would make the one rule unusable on the one screen
  // that needs it most.
  return status.state === 'MISSING' || status.state === 'REJECTED' || status.state === 'EXPIRED';
}
