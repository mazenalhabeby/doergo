/**
 * A failure that means "no network", as opposed to the server saying no.
 *
 * Read from the error's shape rather than `instanceof ApiError`, so the offline
 * logic does not have to import the API client (and, through it, the keychain)
 * to ask the question.
 */
export function isUnreachable(err: unknown): boolean {
  const status = (err as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status === 'number') return status === 0 || status === 408;
  return err instanceof TypeError;
}
