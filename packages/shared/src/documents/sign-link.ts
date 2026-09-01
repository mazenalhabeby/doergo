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
