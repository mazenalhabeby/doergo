import { sealPlaintext, secureStorage, type PlainStorage } from './secure-buffer';
import { PENDING_PREFIX } from '../services/route-buffer';
import { checkInBufferKey } from '../services/check-in-buffer';
import { SAVED_ROUTE_KEY } from '../offline/routes/saved-route';

/**
 * EVERY PER-PERSON STORE KEPT OUTSIDE THE ENCRYPTED DATABASE — in one table.
 *
 * Each is sealed with the member's key (lib/secure-buffer.ts). The table names
 * which AsyncStorage keys belong to which store for one member, so the
 * plaintext an older version left can be re-sealed in place — lazily on a
 * store's first use, and eagerly for all of them as soon as a member's
 * session is known (`sealLeftovers`), so a store that is rarely opened (the
 * old work-log queue) does not keep plaintext on the phone until it is.
 *
 * Adding a store here is the whole job; `secure-buffer-migration.spec.ts`
 * fails if a listed module writes AsyncStorage directly.
 */

/** Remembered home cards: `@hbcfield/kept/{name}/{userId}`. */
export const KEPT_PREFIX = '@hbcfield/kept/';
/** The old work-log queue: `worklog_pending_{owner}:{entryId}`. */
export const WORKLOG_PREFIX = 'worklog_pending_';
/** The route tracker's last point (jump check): `route_last_point:{owner}`. */
export const LAST_POINT_KEY = 'route_last_point';
export const lastPointKey = (owner: string) => `${LAST_POINT_KEY}:${owner}`;
/** The automatic clock's plan and what it remembers of each visit: `auto_clock:{owner}`. */
export const autoClockKey = (owner: string) => `auto_clock:${owner}`;

const STORES = {
  /** Route points held from a dead zone, and the last point kept. */
  route: (owner: string) => (all: readonly string[]) =>
    all.filter((k) => k === `${PENDING_PREFIX}:${owner}` || k.startsWith(`${PENDING_PREFIX}:${owner}:`) || k === lastPointKey(owner)),
  /** GPS check-ins kept without signal. */
  'check-ins': (owner: string) => (all: readonly string[]) => all.filter((k) => k === checkInBufferKey(owner)),
  /** What the home cards were last told. */
  kept: (owner: string) => (all: readonly string[]) => all.filter((k) => k.startsWith(KEPT_PREFIX) && k.endsWith(`/${owner}`)),
  /** Notes from a shift and their photos' paths. */
  worklog: (owner: string) => (all: readonly string[]) => all.filter((k) => k.startsWith(`${WORKLOG_PREFIX}${owner}:`)),
  /** The day's planned stops — clients' addresses and coordinates. */
  'route-plan': (owner: string) => (all: readonly string[]) => all.filter((k) => k === SAVED_ROUTE_KEY(owner)),
  /** The automatic clock: where the member's workspaces are, when they walked in and out. */
  'auto-clock': (owner: string) => (all: readonly string[]) => all.filter((k) => k === autoClockKey(owner)),
} as const;

export type SealedStoreName = keyof typeof STORES;

/** The member's sealed store `name`. */
export function sealedStore(name: SealedStoreName, owner: string): PlainStorage {
  return secureStorage(owner, name, STORES[name](owner));
}

/**
 * Re-seal whatever plaintext an older version left for this member, in every
 * store, now. Never throws; what cannot be sealed yet (keychain not readable)
 * stays as it is and is sealed on the next use.
 */
export async function sealLeftovers(owner: string): Promise<void> {
  for (const name of Object.keys(STORES) as SealedStoreName[]) {
    await sealPlaintext(owner, name, STORES[name](owner)).catch(() => undefined);
  }
}
