/**
 * Answers the server gave this member, kept so a screen still opens with no
 * signal.
 *
 * Every staff screen fetches its data itself; wrapping each in its own offline
 * logic would be dozens of copies of one rule. Instead the one API client asks
 * this: a GET that fails for want of a network is answered with the last
 * answer to the same request, if this phone has one.
 *
 * The store is the member's ENCRYPTED offline database, plugged in by the
 * offline layer (setResponseCache) and removed with it — never AsyncStorage,
 * and never shared between members. A build without the offline layer plugs in
 * nothing and behaves exactly as before.
 */
interface ResponseCacheStore {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, body: unknown): Promise<void>;
}

let store: ResponseCacheStore | null = null;

export function setResponseCache(next: ResponseCacheStore | null): void {
  store = next;
}

/*
  WHAT MAY BE HELD — DECIDED BY THE ENDPOINT, NOT BY A PATH PATTERN.

  Every GET the phone makes comes from the shared endpoint table
  (packages/shared/src/http/endpoints), and the table marks each one:
  `keep: true` — the member's own data, harmless to hold (their history, their
  documents, their calendar, the Clients card, a job's time…); `keep: false` —
  never (presence: who is on RIGHT NOW, running rests, no-shows, the approvals
  COUNT beside them; the shift and the work log, which have their own richer
  offline readers; sign-in, billing, the sync protocol). A `keep` function
  decides per call — `all-entries?status=CLOCKED_IN` is presence, the same
  route for last week is history.

  This file used to hold those decisions as two lists of regular expressions
  (KEEP / NEVER) matched against the path. Every one of them is now carried by
  the table (offline-reads.spec walks the phone's GETs and checks it), so what
  remains here is only what is the PHONE's own:

  - An endpoint the table has not marked is NOT kept (an allow-list, as
    before): it is kept once somebody has decided its answer is the member's
    own data. `FALLBACK_KEEP` is where such a decision goes until the table
    carries it.
  - `PHONE_NEVER` — where the phone deliberately keeps LESS than the table.
  - `CREDENTIALS` — signed links (they expire and are credentials), the sync
    protocol and live GPS are never held, whatever any table says.
*/

/** Unmarked endpoints the phone keeps anyway — empty: the table marks every one the phone reads. */
const FALLBACK_KEEP: readonly RegExp[] = [];

const PHONE_NEVER: readonly RegExp[] = [
  /*
    `/rota/week` — other people's staffing, read by a rota manager: not the
    member's own data to hold on a phone, and a stale week is a wrong one. The
    shared table marks it `keep: true`; the phone has never kept it.
  */
  /^\/rota\/week(\?|$)/,
];

const CREDENTIALS: readonly RegExp[] = [/url(\?|$)/i, /presign/i, /download/i, /\/sync\//, /\/tracking\//];

/**
 * May this answer be held? `keep` is the endpoint's own verdict (the cache
 * request carries it); an unmarked path falls back to `FALLBACK_KEEP`.
 */
export function shouldKeep(endpoint: string, keep?: boolean): boolean {
  if (CREDENTIALS.some((r) => r.test(endpoint)) || PHONE_NEVER.some((r) => r.test(endpoint))) return false;
  if (keep !== undefined) return keep;
  return FALLBACK_KEEP.some((r) => r.test(endpoint));
}

/** Save an answer. Never fails the request it belongs to. */
export function keepResponse(endpoint: string, body: unknown, keep?: boolean): void {
  if (!store || !shouldKeep(endpoint, keep)) return;
  void store.put(endpoint, body).catch(() => undefined);
}

/** The last answer to this request, when there is no network to ask. */
export async function keptResponse(endpoint: string, keep?: boolean): Promise<unknown | undefined> {
  if (!store || !shouldKeep(endpoint, keep)) return undefined;
  try {
    return await store.get(endpoint);
  } catch {
    return undefined;
  }
}
