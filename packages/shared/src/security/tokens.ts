import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Bearer secrets that travel by email — reset links, signing links.
 *
 * NOT client-safe: this uses node's crypto and is exported from the root entry
 * only. It must never reach a browser bundle, where generating a token would be
 * meaningless and hashing one would be a lie.
 *
 * The codebase already had two byte-identical copies of the hash — one in
 * `auth.service.ts` for password resets, one in `invitation.service.ts` for
 * codes. This is the third place that needed it, which is one more than a
 * duplicated security primitive should ever reach.
 */

/**
 * A secret for a URL.
 *
 * 32 random bytes, base64url so it survives a query string untouched. The
 * invitation code's 10 characters from a 32-symbol alphabet is ~50 bits, which
 * is right for something a person types and far too little for something that
 * is the only thing standing between a stranger and a company's paperwork.
 */
export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * What gets stored: the digest, never the secret.
 *
 * Lookup is BY this value, so the database index does the comparison and there
 * is no string compare to time. `verifySecret` exists for the rarer case where
 * a candidate is compared against a hash already in hand.
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Compare a presented secret against a stored digest, without leaking timing. */
export function verifySecret(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
