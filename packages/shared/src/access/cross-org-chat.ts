/**
 * May two people in DIFFERENT organizations hold a conversation?
 *
 * Cross-org chat exists because two companies share a space and their people
 * work it together. That is the whole permission: it is not a property of the
 * two orgs, and it is not something granted once when a thread is created — it
 * is the live state of one share, and it must be re-asked every time.
 *
 * So this returns the SPACE that authorizes the conversation rather than a
 * boolean. The caller stores that id on the conversation, and every later send
 * re-resolves it. Anchor and decision cannot drift apart, because they are the
 * same value. When the share is revoked the thread freezes on its own — nothing
 * to invalidate, no cleanup job, no denormalized flag that can silently go
 * stale while looking healthy.
 *
 * Pure and dependency-free: the caller supplies the facts, this decides.
 */

/** The share, as this rule needs to see it. */
export interface ChatShareFacts {
  spaceId: string;
  ownerOrgId: string;
  guestOrgId: string;
  /** Only ACTIVE counts. A revoked share keeps its row — checking for the row's
   *  existence instead of its status would be a silent hole. */
  status: string;
  /** The owner's explicit "the guest org may see the people here". No workers
   *  shown, no conversations. */
  showWorkers: boolean;
  expiresAt?: Date | string | null;
}

/** A participant, as this rule needs to see them. */
export interface ChatParty {
  userId: string;
  organizationId: string;
  role: string;
  /** Effective space assignments — the spaces this person actually works. */
  spaceIds: string[];
}

const CUSTOMER_ROLE = 'CUSTOMER';
const ACTIVE = 'ACTIVE';

function isLive(share: ChatShareFacts, now: Date): boolean {
  if (share.status !== ACTIVE) return false;
  if (!share.showWorkers) return false;
  if (!share.expiresAt) return true;
  return new Date(share.expiresAt).getTime() > now.getTime();
}

/** Does this share join exactly these two orgs, in either direction? */
function joins(share: ChatShareFacts, orgA: string, orgB: string): boolean {
  return (
    (share.ownerOrgId === orgA && share.guestOrgId === orgB) ||
    (share.ownerOrgId === orgB && share.guestOrgId === orgA)
  );
}

/**
 * The space that authorizes a conversation between `a` and `b`, or null.
 *
 * Both must be assigned to it. Visibility of a space is not licence to message
 * the people in it: a share can expose a whole guest org, and without this
 * every employee there could open a thread with any of the owner's workers.
 * Requiring an assignment on both sides keeps it to the people actually doing
 * the work — the same basis in-org contact routing already uses.
 *
 * When several shares qualify, the first is returned; they are equivalent
 * grants, and `preferSpaceId` lets a caller keep an existing anchor stable.
 */
export function resolveCrossOrgChatSpace(
  a: ChatParty,
  b: ChatParty,
  shares: ChatShareFacts[],
  options: { now?: Date; preferSpaceId?: string | null } = {},
): string | null {
  const now = options.now ?? new Date();

  // Same org is not this rule's business — the in-org contact rules apply.
  if (!a.organizationId || !b.organizationId) return null;
  if (a.organizationId === b.organizationId) return null;
  // External customer accounts are never part of member chat, either direction.
  if (a.role === CUSTOMER_ROLE || b.role === CUSTOMER_ROLE) return null;
  if (a.userId === b.userId) return null;

  const aSpaces = new Set(a.spaceIds);
  const bSpaces = new Set(b.spaceIds);

  const qualifies = (s: ChatShareFacts) =>
    isLive(s, now) &&
    joins(s, a.organizationId, b.organizationId) &&
    aSpaces.has(s.spaceId) &&
    bSpaces.has(s.spaceId);

  // Keep an existing anchor if it is still good, so a conversation does not
  // silently migrate between shares underneath the people using it.
  if (options.preferSpaceId) {
    const kept = shares.find((s) => s.spaceId === options.preferSpaceId && qualifies(s));
    if (kept) return kept.spaceId;
  }

  return shares.find(qualifies)?.spaceId ?? null;
}

/**
 * Is an existing cross-org conversation still permitted to carry new messages?
 *
 * Strictly its own anchor: the share that authorized this thread is the one
 * that has to still be alive. Another share between the same orgs does not
 * silently keep it open — re-anchoring is a decision, made when a conversation
 * is opened, not a side effect of sending.
 */
export function isCrossOrgConversationLive(
  originSpaceId: string,
  a: ChatParty,
  b: ChatParty,
  shares: ChatShareFacts[],
  now: Date = new Date(),
): boolean {
  if (!originSpaceId) return false;
  return (
    resolveCrossOrgChatSpace(a, b, shares, { now, preferSpaceId: originSpaceId }) === originSpaceId
  );
}
