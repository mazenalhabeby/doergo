import { type ApiResponse } from "../http-client"
import { apiError } from "../server-error"

/** Reading a documents answer: most routes wrap in { success, data }, this unwraps either shape. */
/**
 * Unwrap a documents response.
 *
 * These routes return the payload BARE — `[…]` or `{…}` — not wrapped in
 * `{ success, data }` like most of this file. Reading `response.data.data` gave
 * `undefined`, `|| []` turned that into an empty list, and every document
 * screen rendered "Nothing here yet" against a database with 184 documents in
 * it. Nothing errored; the data was simply thrown away on arrival.
 *
 * One helper rather than the same guard at twenty call sites: whichever shape
 * arrives, the caller gets the payload.
 */
/** The payload a documents answer carries: `X` from `{ success, data: X }`, or the bare answer itself. */
type DocumentsPayload<R> = R extends { data: infer D } ? D : R

/**
 * `unwrapDocuments<X>(response)` names the payload; `unwrapDocuments(response)` reads it off the
 * response's own type (the `{ success, data: X }` the call was typed with).
 */
export function unwrapDocuments<T = never, R = unknown>(
  response: ApiResponse<R>,
): ([T] extends [never] ? DocumentsPayload<R> : T) | undefined {
  type Out = [T] extends [never] ? DocumentsPayload<R> : T
  if (response.error) throw apiError(response)
  const body: unknown = response.data
  if (body === null || body === undefined) return undefined
  // A wrapped payload carries `data`; a bare array or object is itself.
  if (!Array.isArray(body) && typeof body === "object" && "data" in body) {
    return body.data as Out
  }
  return body as Out
}
