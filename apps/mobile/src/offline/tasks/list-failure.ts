import { isUnreachable } from '../actions/unreachable';

/**
 * A home screen's task list did not load. Is that worth the whole screen?
 *
 * `tasksApi.list()` is the ONE unguarded call on every home variant —
 * everything else is `.catch(() => [])` or comes from `useShift` — so an error
 * let out of it replaced the entire dashboard with a full-screen "You're
 * offline", throwing away the banner, the shift card and every panel that had
 * already loaded beside it.
 *
 * The rule, in one place because three screens ask it:
 *
 *  - the server REFUSED (a 403, a 500): fatal. Something is wrong that the
 *    member cannot read past, and the error state is the honest answer.
 *  - nothing answered, and there is something on screen: not fatal. The
 *    OfflineBanner already says what the network is doing.
 *  - nothing answered, and the phone's database is still OPENING: not fatal.
 *    This request only happened because the copy was not there yet — a cold
 *    start reaches `load()` before the database does — and it is about to
 *    arrive. Declaring the member offline a few hundred milliseconds before
 *    their own data appears is how a phone with full signal shows an error
 *    that a Retry button then clears.
 *  - nothing answered, nothing to show, no copy coming: fatal.
 */
export function listFailureIsFatal(
  err: unknown,
  state: { shown: boolean; databaseStarting: boolean },
): boolean {
  if (!isUnreachable(err)) return true;
  return !state.shown && !state.databaseStarting;
}
