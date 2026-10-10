/**
 * The server's answer, taken out of its envelope BY SHAPE.
 *
 * Every API answer is `{ success, data, meta?, message? }` (shared `success()` /
 * `paginated()`), and a few controllers answer a bare `{ data }`. Unwrapping
 * with `body.data ?? body` turned `{ success: true, data: null }` ("there is no
 * report") into the ENVELOPE, so a screen asked for a report got the envelope
 * back and had to guess. And `meta`, the only place a page's total lives, was
 * thrown away.
 *
 * ⚠️ AN ENVELOPE IS RECOGNISED BY ITS SHAPE, NOT BY `data` BEING SET:
 * `success` beside `data`, or `data` with nothing but envelope keys beside it.
 * Its `data` is returned even when it is null.
 *
 * ⚠️ AND ONE OLDER SHAPE STAYS UNWRAPPED. Some services answer straight
 * through the gateway with `{ data, hasMore }` and no `success` (chat history),
 * and the phone's call sites were written against `data ?? body`. So an object
 * with a SET `data` is still unwrapped as before; only a null `data` needs the
 * envelope's shape to be read as "nothing" rather than returned whole.
 *
 * Moved here from the phone (apps/mobile/src/lib/api/envelope.ts) unchanged in
 * behaviour, so the phone migrates onto it without a single answer changing.
 */

export interface PageMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

/** What may sit beside `data` in an envelope. Anything else means it is not one. */
const ENVELOPE_KEYS = new Set(['success', 'data', 'meta', 'message', 'statusCode', 'error', 'code', 'params', 'timestamp', 'hasMore']);

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function isEnvelope(body: unknown): body is { data: unknown; meta?: unknown } {
  if (!isPlainObject(body) || !Object.prototype.hasOwnProperty.call(body, 'data')) return false;
  if (typeof body.success === 'boolean') return true;
  return Object.keys(body).every((k) => ENVELOPE_KEYS.has(k));
}

/** The answer itself: an envelope's `data` (null stays null), or the body as it came. 204/empty → null. */
export function unwrapEnvelope<T>(body: unknown): T {
  if (body === undefined || body === null) return null as T;
  if (isEnvelope(body)) return (body.data === undefined ? null : body.data) as T;
  // The older pass-through shape (see above): a set `data` is the answer.
  if (isPlainObject(body) && body.data !== undefined && body.data !== null) return body.data as T;
  return body as T;
}

/** A paginated answer's `meta`, or null when the server sent none. */
export function envelopeMeta(body: unknown): PageMeta | null {
  if (!isEnvelope(body)) return null;
  return isPlainObject(body.meta) ? (body.meta as PageMeta) : null;
}

/** An answer with its page information: `{ data, meta }`. */
export interface Page<T> {
  data: T;
  meta: PageMeta | null;
}

export function unwrapPage<T>(body: unknown): Page<T> {
  return { data: unwrapEnvelope<T>(body), meta: envelopeMeta(body) };
}

/**
 * A response body read as text and parsed as JSON — without assuming there is one.
 *
 * ⚠️ 204 HAS NO BODY. `response.json()` on it throws, and the phone counted
 * that as "no network" — so every telemetry report (answered 204) told the
 * connectivity monitor the phone was offline. Empty is `null`, not a failure.
 *
 * A body that is present but not JSON throws a SyntaxError; the client decides
 * what that means (a 2xx it cannot read is a `parse` error; a proxy's HTML page
 * on a 502 is still the 502).
 */
export async function readBody(response: { status: number; text(): Promise<string> }): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null;
  const text = await response.text();
  if (!text || !text.trim()) return null;
  return JSON.parse(text) as unknown;
}
