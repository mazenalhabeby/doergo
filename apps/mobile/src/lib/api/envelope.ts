/**
 * The server's answer, taken out of its envelope BY SHAPE.
 *
 * Every API answer is `{ success, data, meta?, message? }` (shared `success()` /
 * `paginated()`), and a few controllers answer a bare `{ data }`. The client
 * used to unwrap with `body.data ?? body` — which turned `{ success: true,
 * data: null }` ("there is no report") into the ENVELOPE, so a screen asked for
 * a report got `{ success: true, data: null }` and had to guess. And `meta`,
 * the only place a page's total lives, was thrown away.
 *
 * ⚠️ AN ENVELOPE IS RECOGNISED BY ITS SHAPE, NOT BY `data` BEING SET:
 * `success` beside `data`, or `data` with nothing but envelope keys beside it.
 * Its `data` is returned even when it is null.
 *
 * ⚠️ AND ONE OLDER SHAPE STAYS UNWRAPPED. Some services answer straight
 * through the gateway with `{ data, hasMore }` and no `success` (chat history),
 * and ~250 call sites were written against `data ?? body`. So an object with a
 * SET `data` is still unwrapped as before; only a null `data` needs the
 * envelope's shape to be read as "nothing" rather than returned whole.
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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function isEnvelope(body: unknown): body is { data: unknown; meta?: unknown } {
  if (!isPlainObject(body) || !Object.prototype.hasOwnProperty.call(body, 'data')) return false;
  if (typeof body.success === 'boolean') return true;
  return Object.keys(body).every((k) => ENVELOPE_KEYS.has(k));
}

/** The answer itself: an envelope's `data` (null stays null), or the body as it came. */
export function unwrapEnvelope<T>(body: unknown): T {
  if (body === undefined) return null as T;
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

/** The server's machine-readable refusal: its `code` and the `params` that fill the sentence. */
export function refusalDetails(body: unknown): { code?: string; params?: Record<string, unknown> } {
  if (!isPlainObject(body)) return {};
  const err = isPlainObject(body.error) ? body.error : null;
  const code = typeof body.code === 'string' ? body.code : typeof err?.code === 'string' ? (err.code as string) : undefined;
  const params = isPlainObject(body.params) ? body.params : isPlainObject(err?.params) ? (err!.params as Record<string, unknown>) : undefined;
  return { ...(code ? { code } : {}), ...(params ? { params } : {}) };
}

/**
 * Read a response body without assuming there is one.
 *
 * ⚠️ 204 HAS NO BODY. `response.json()` on it throws, and the client counted
 * that as "no network" — so every telemetry report (answered 204) told the
 * connectivity monitor the phone was offline. Empty is `null`, not a failure.
 *
 * A body that is present but not JSON still throws, exactly as before: a 502
 * page from a proxy is the network failing, not an answer.
 */
export async function readBody(response: {
  status: number;
  text?: () => Promise<string>;
  json: () => Promise<unknown>;
}): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null;
  if (typeof response.text !== 'function') return response.json();
  const text = await response.text();
  if (!text || !text.trim()) return null;
  return JSON.parse(text);
}
