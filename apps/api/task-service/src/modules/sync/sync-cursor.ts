import type { SyncPullResponse } from '@hbcfield/shared';

/** The position a pull reached: last change seen, and last tombstone seen. */
export interface Cursor {
  v: 1;
  /** updatedAt of the last row sent (ISO). */
  t: string;
  /** id of the last row sent, to break updatedAt ties. */
  i: string;
  /** Highest tombstone id seen. */
  d: string;
  /**
   * When this cursor was issued (server time). ⚠️ The age check reads THIS, not
   * `t`: a scope whose newest change is months old is perfectly current, and
   * judging staleness by the row's date reset every page of an old scope back
   * to the start — the pull never advanced.
   */
  s: string;
}

export function encodeCursor(c: Omit<Cursor, 'v'>): string {
  return Buffer.from(JSON.stringify({ v: 1, ...c })).toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      c?.v !== 1 || typeof c.t !== 'string' || typeof c.i !== 'string' || !/^\d+$/.test(String(c.d)) ||
      Number.isNaN(Date.parse(c.t)) || typeof c.s !== 'string' || Number.isNaN(Date.parse(c.s))
    ) {
      return null;
    }
    return c as Cursor;
  } catch {
    return null;
  }
}

/**
 * One page of a scope, with the cursor that resumes after it: the last row's
 * (updatedAt, id), the highest tombstone seen, and when this was served. An
 * empty page keeps the caller's position rather than rewinding to the epoch.
 */
export function pageResponse(
  scope: SyncPullResponse['scope'],
  page: Array<{ id: string; updatedAt: Date }>,
  deleted: string[],
  at: { from?: { t: string; i: string } | null; highestTombstone: number | bigint | string; hasMore: boolean; reset: boolean },
) {
  const last = page.at(-1);
  return {
    scope,
    rows: page,
    deleted,
    cursor: encodeCursor({
      t: last ? last.updatedAt.toISOString() : at.from?.t ?? new Date(0).toISOString(),
      i: last ? last.id : at.from?.i ?? '',
      d: String(at.highestTombstone),
      s: new Date().toISOString(),
    }),
    hasMore: at.hasMore,
    reset: at.reset,
    serverTime: new Date().toISOString(),
  };
}
