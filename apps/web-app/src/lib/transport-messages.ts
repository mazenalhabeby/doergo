/**
 * The sentences a request with NO answer carries — network, timeout, cancel.
 *
 * Their own tiny module (no client, no session) so `server-error.ts` and the
 * i18n set-up can recognise them without dragging the request pipeline into
 * every bundle that only wants to read an error.
 *
 * They are the shared core's defaults word for word, so an error built by the
 * core and one built here read the same and are recognised the same.
 */
export const TRANSPORT_MESSAGES = {
  NETWORK: "Unable to reach the server. Please check your connection and try again.",
  TIMEOUT: "The server took too long to answer. Please try again.",
  ABORTED: "Request was cancelled.",
} as const

/** A bare `new Error(message)` that is really "nothing answered"? */
export function isTransportMessage(message: unknown): boolean {
  return message === TRANSPORT_MESSAGES.NETWORK || message === TRANSPORT_MESSAGES.TIMEOUT
}
