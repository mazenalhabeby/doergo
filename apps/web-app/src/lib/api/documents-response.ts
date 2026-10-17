import { type ApiResponse } from '../http-client';
import { apiError } from '../server-error';

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
export function unwrapDocuments<T>(response: ApiResponse<unknown>): T | undefined {
  if (response.error) throw apiError(response);
  const body = response.data as any;
  if (body === null || body === undefined) return undefined;
  // A wrapped payload carries `data`; a bare array or object is itself.
  if (!Array.isArray(body) && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}
