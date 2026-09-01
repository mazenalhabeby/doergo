/**
 * The emailed signing link: what it is worth, when it dies, and what a client
 * is allowed to do with it.
 *
 * Pure, and shared on purpose. The service decides whether to accept a token,
 * the public page decides what to render, and the certificate decides what to
 * claim — three answers that must never disagree about the same link. Anything
 * touching Prisma, storage or Nest belongs in the service, not here.
 */

/** How long a link lives. Matches `offerValidDays`, the product's existing
 *  answer to "how long does an unanswered document stay open". Short is safe
 *  here only because expiry is recoverable — see `LINK_REISSUE_COOLDOWN_MS`. */
export const SIGN_LINK_TTL_DAYS = 14;

/**
 * How long before the same client can be sent another link.
 *
 * The "send me a new link" form is the one part of this a stranger can reach.
 * Per-IP throttling stops one machine hammering it; this stops many machines
 * being pointed at one client's inbox.
 */
export const LINK_REISSUE_COOLDOWN_MS = 5 * 60 * 1000;

/** Most documents one ceremony may cover. A bound, not a target: signing is a
 *  PDF re-render each, and an unbounded batch is an unbounded request. */
export const MAX_BATCH_SIGN = 50;

/** Why a link cannot be used. `null` means it can. */
export type SignLinkRefusal = 'unknown' | 'expired';

export interface SignLinkState {
  expiresAt: Date | string;
}

/**
 * Is this link still usable?
 *
 * Deliberately returns the REASON rather than a boolean: "expired" earns an
 * offer of a new one, while "unknown" must say nothing at all — the two cannot
 * share a code path without eventually sharing a message.
 */
export function signLinkRefusal(
  link: SignLinkState | null | undefined,
  now: Date = new Date(),
): SignLinkRefusal | null {
  if (!link) return 'unknown';
  return new Date(link.expiresAt).getTime() <= now.getTime() ? 'expired' : null;
}

/** May another link be sent to this client yet? */
export function canReissue(
  lastSentAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - new Date(lastSentAt).getTime() >= LINK_REISSUE_COOLDOWN_MS;
}

/** When a link minted now should expire. */
export function signLinkExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SIGN_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** One document as the client's list shows it. */
export interface SignableDocument {
  documentId: string;
  signerId: string;
  title: string;
  /** The member the document is about — how a client tells eleven time sheets
   *  called the same thing apart. */
  forMember: string | null;
  periodYear: number | null;
  periodMonth: number | null;
  /** Who has already signed, in order. A countersignature means nothing if you
   *  cannot see what you are countersigning behind. */
  alreadySigned: { name: string; role: string; signedAt: string }[];
  openedAt: string | null;
}

/**
 * Which of the requested documents may actually be signed.
 *
 * The client sends back ids from a page that may be minutes or hours old — a
 * document could have been sent back or revoked since it was drawn. Trusting
 * the request would let somebody sign a document that had left their queue, so
 * the selection is always intersected with what is pending RIGHT NOW.
 */
export function acceptedForSigning(
  requestedSignerIds: string[],
  pending: { signerId: string }[],
): string[] {
  const live = new Set(pending.map((p) => p.signerId));
  const seen = new Set<string>();
  return requestedSignerIds.filter((id) => {
    if (!live.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Where the counterparty on a CUSTOMER step comes from.
 *
 * A space already knows who it is for, and asking a second source when the
 * first one holds the answer is how two records of the same client drift apart.
 * So the source is decided, not configured:
 *
 *   SPACE   the space IS a client company (`kind: CUSTOMER`) and carries the
 *           contact — the details are already there, and a CRM record would be
 *           a duplicate of them
 *   CRM     an internal space with the CRM module on — the clients are real
 *           records and choosing one links the document to it
 *   MANUAL  neither — type the name and address, once, for this document
 *
 * MANUAL is always available regardless of what this returns. A cascade decides
 * what is OFFERED; it must never decide what is possible, because the one time
 * somebody needs to send a document to a person the system has never heard of
 * is exactly the time a closed list makes the product useless.
 */
export type CounterpartySource = 'SPACE' | 'CRM' | 'MANUAL';

export function counterpartySourceFor(
  space: { kind?: string | null; contactEmail?: string | null } | null | undefined,
  modules: readonly string[] = [],
): CounterpartySource {
  if (!space) return 'MANUAL';
  // A client space without a contact address is not a source — it is a space
  // somebody has not finished filling in, and offering it would resolve a step
  // to somebody unreachable.
  if (space.kind === 'CUSTOMER' && (space.contactEmail ?? '').trim()) return 'SPACE';
  if (modules.includes('crm')) return 'CRM';
  return 'MANUAL';
}

/** A plausible address, checked before anything is stored or sent. */
export function isUsableEmail(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  return v.length >= 6 && v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Nobody countersigns their own document.
 *
 * A chain is worth something because each step is a DIFFERENT person vouching.
 * The moment the member the document is about also holds a later step, the
 * signatures below the first one prove nothing — and it happens quietly, not by
 * anybody deciding it should: one person with a personal login and a client
 * record, or a member who is also an admin, resolves to themselves under a
 * second hat and the chain looks complete.
 *
 * Matched on the ADDRESS as well as the id, because the two hats rarely share a
 * user id and very often share an inbox. A client record carrying the member's
 * own email is the ordinary way this happens.
 */
export function isSelfSigning(
  member: { id?: string | null; email?: string | null },
  candidate: { userId?: string | null; email?: string | null },
): boolean {
  if (member.id && candidate.userId && member.id === candidate.userId) return true;
  const a = (member.email ?? '').trim().toLowerCase();
  const b = (candidate.email ?? '').trim().toLowerCase();
  return a.length > 0 && a === b;
}
