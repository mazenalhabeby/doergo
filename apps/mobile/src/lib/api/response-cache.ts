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
export interface ResponseCacheStore {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, body: unknown): Promise<void>;
}

let store: ResponseCacheStore | null = null;

export function setResponseCache(next: ResponseCacheStore | null): void {
  store = next;
}

/*
  An allow-list, not a deny-list: a new endpoint is kept only once somebody has
  decided its answer is the member's own data and harmless to hold.

  ⚠️ Never kept: sign-in, billing, signed links (they expire and are
  credentials), the live map and presence (stale is wrong, not old), and the
  sync protocol itself (it has its own store). The customer portal keeps only
  a client's own config, units and requests — each member has their own
  database, so nothing crosses between a client and a colleague on one phone.
*/
const KEEP: readonly RegExp[] = [
  /^\/attendance(\/|\?|$)/,
  /^\/reports\//,
  /^\/documents(\/|\?|$)/,
  /^\/assets\/(mine|expenses\/mine|proposals\/mine|custody)/,
  // My own logbook entries and what is due on what I hold — read offline so an
  // entry queued with no signal is shown beside the ones already delivered.
  /^\/assets\/log\/(mine|due-mine)(\?|$)/,
  /^\/shift-issues(\/|\?|$)/,
  /*
    ⚠️ `(\/|\?|$)`, not `\/`. The pattern used to demand a trailing slash, so
    `/employees/:id` was kept and the LIST behind it — `/employees?page=1`, the
    whole Team tab — was not. A member offline could open one colleague and
    never the roster they reached them through.
  */
  /^\/employees(\/|\?|$)/,
  /^\/overtime(\/|\?|$)/,
  /^\/support(\/|\?|$)/,
  /^\/chat(\/|\?|$)/,
  /^\/customers(\/|\?|$)/,
  /^\/users\/me(\?|$)/,
  /^\/locations(\/|\?|$)/,
  /^\/organizations\/(members|join-code)(\/|\?|$)/,
  /^\/join-requests(\?|$)/,
  /^\/invitations(\?|$)/,
  /^\/custom-fields(\/|\?|$)/,
  /*
    The task's own extra fields. NOT covered by src/offline/tasks, which fetches
    the task, its notes and its photos — so a task opened in a basement showed
    every field the organization added as missing rather than as what it holds.
  */
  /^\/tasks\/[^/]+\/custom-fields(\?|$)/,
  // The task's history. Read-only, already-happened facts about one job — the
  // Activity panel rendered empty with no signal on a task the phone holds.
  /^\/tasks\/[^/]+\/timeline(\?|$)/,
  // The kinds of thing an organization owns — the vocabulary every asset screen
  // reads before it can label a single row.
  /^\/asset-categories(\/|\?|$)/,
  /^\/organizations\/contacts(\/|\?|$)/,
  // The member's own notification choices: their data, and the settings screen
  // renders switches from it.
  /^\/users\/me\/notification-prefs(\?|$)/,
  /^\/routes(\/|\?|$)/,
  // A portal client's own portal, requests and units — what they already saw.
  /^\/portal\/(config|units|requests)(\/|\?|$)/,
];
const NEVER: readonly RegExp[] = [
  /url(\?|$)/i, /presign/i, /download/i, /\/sync\//, /\/tracking\//,
  /*
    Read offline by their own, richer path — pulled records with unsent changes
    laid on top, on a screen that says the copy is from the phone. A kept
    response would answer first, older, and pretend to be fresh. (Tasks are not
    in the list above for the same reason: src/offline/tasks.)
  */
  /^\/attendance\/(status|breaks\/status)(\?|$)/,
  /^\/attendance\/entries\/[^/]+\/worklog(\?|$)/,
];

export function isKeptResponse(endpoint: string): boolean {
  return KEEP.some((r) => r.test(endpoint)) && !NEVER.some((r) => r.test(endpoint));
}

/** Save an answer. Never fails the request it belongs to. */
export function keepResponse(endpoint: string, body: unknown): void {
  if (!store || !isKeptResponse(endpoint)) return;
  void store.put(endpoint, body).catch(() => undefined);
}

/** The last answer to this request, when there is no network to ask. */
export async function keptResponse(endpoint: string): Promise<unknown | undefined> {
  if (!store || !isKeptResponse(endpoint)) return undefined;
  try {
    return await store.get(endpoint);
  } catch {
    return undefined;
  }
}
