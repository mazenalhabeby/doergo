import { ConflictException } from '@nestjs/common';

/**
 * Create a record whose id the PHONE chose — once, however often it is sent.
 *
 * A phone that created a comment offline sends it with the id it made. If the
 * first send reached the server and only the answer was lost, the retry must get
 * the SAME comment back, not a second one. The idempotency key covers retries of
 * one request; this covers the record itself, across keys, replicas and a Redis
 * restart.
 *
 * ⚠️ An id already used by somebody else's record is refused, never returned —
 * otherwise guessing an id would read another member's comment.
 */
export async function createOnce<T>(opts: {
  id: string | undefined;
  find: (id: string) => Promise<T | null>;
  /** Is this existing row the same record the caller is creating? */
  isSame: (row: T) => boolean;
  create: () => Promise<T>;
}): Promise<{ row: T; created: boolean }> {
  if (!opts.id) return { row: await opts.create(), created: true };

  const existing = await findPrior(opts);
  if (existing) return { row: existing, created: false };

  try {
    return { row: await opts.create(), created: true };
  } catch (err) {
    // Two sends racing: the other one created it between our read and write.
    if ((err as { code?: string })?.code !== 'P2002') throw err;
    const raced = await opts.find(opts.id);
    if (!raced) throw err;
    return { row: ownOrRefuse(raced, opts.isSame), created: false };
  }
}

/**
 * The record a resend already made, or null. For creates that must run checks
 * BETWEEN "does it exist" and "make it" — an overlap rule would otherwise refuse
 * the resend of a request as overlapping itself.
 */
export async function findPrior<T>(opts: {
  id: string | undefined;
  find: (id: string) => Promise<T | null>;
  isSame: (row: T) => boolean;
}): Promise<T | null> {
  if (!opts.id) return null;
  const existing = await opts.find(opts.id);
  return existing ? ownOrRefuse(existing, opts.isSame) : null;
}

function ownOrRefuse<T>(row: T, isSame: (row: T) => boolean): T {
  if (!isSame(row)) {
    throw new ConflictException({ message: 'This id is already in use', code: 'ID_IN_USE' });
  }
  return row;
}
