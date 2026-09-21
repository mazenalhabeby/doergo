/**
 * Closing the app and opening it again showed a full-screen "You're offline"
 * on a phone with full signal, with a Retry button that worked first time.
 *
 * Two things had to be true for that. The connection inherited from the killed
 * process was stale, so the first request failed (retried once in the API
 * client now — `src/lib/api/__tests__/network-retry.spec.ts`); and the failure
 * of that ONE list took the whole dashboard down, because it is the only call
 * on those screens without a fallback.
 *
 * This is the second half: what a failed list is allowed to cost.
 */
import { listFailureIsFatal } from '../tasks/list-failure';

const offline = { statusCode: 0 };
const timedOut = { statusCode: 408 };
const refused = { statusCode: 403 };

describe('a home screen whose task list did not load', () => {
  it('shows the error when the server refused — that is not a network problem', () => {
    expect(listFailureIsFatal(refused, { shown: false, databaseStarting: false })).toBe(true);
    expect(listFailureIsFatal(refused, { shown: true, databaseStarting: true })).toBe(true);
  });

  it('keeps what is already on screen when nothing answered', () => {
    expect(listFailureIsFatal(offline, { shown: true, databaseStarting: false })).toBe(false);
    expect(listFailureIsFatal(timedOut, { shown: true, databaseStarting: false })).toBe(false);
  });

  it('waits on a cold start: the database is still opening and the copy is coming', () => {
    expect(listFailureIsFatal(offline, { shown: false, databaseStarting: true })).toBe(false);
  });

  it('still shows the error with nothing to show and no copy coming', () => {
    expect(listFailureIsFatal(offline, { shown: false, databaseStarting: false })).toBe(true);
  });
});
