/**
 * A failure that means "no network", as opposed to the server saying no.
 *
 * Read from the error's shape rather than `instanceof ApiError`, so the offline
 * logic does not have to import the API client (and, through it, the keychain)
 * to ask the question.
 */
export function isUnreachable(err: unknown): boolean {
  const status = (err as { statusCode?: unknown } | null)?.statusCode;
  /*
    0 is every failure that never reached a server — the client's NETWORK,
    TIMEOUT (it was 408 before the client moved onto the shared core) and
    SESSION_UNREACHABLE. A 408 from a server still means "too slow" and stays.
  */
  if (typeof status === 'number') return status === 0 || status === 408;
  return err instanceof TypeError;
}
