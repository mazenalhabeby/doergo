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
 * The rules now live in the shared core (packages/shared/src/http/core/envelope.ts),
 * moved there from this file unchanged; this module re-exports them.
 *
 * ⚠️ AND ONE OLDER SHAPE STAYS UNWRAPPED. Some services answer straight
 * through the gateway with `{ data, hasMore }` and no `success` (chat history),
 * and ~250 call sites were written against `data ?? body`. So an object with a
 * SET `data` is still unwrapped as before; only a null `data` needs the
 * envelope's shape to be read as "nothing" rather than returned whole.
 */

export { isEnvelope, unwrapEnvelope, envelopeMeta, readBody, type PageMeta } from '@hbcfield/shared/client';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** The server's machine-readable refusal: its `code` and the `params` that fill the sentence. */
export function refusalDetails(body: unknown): { code?: string; params?: Record<string, unknown> } {
  if (!isPlainObject(body)) return {};
  const err = isPlainObject(body.error) ? body.error : null;
  const code = typeof body.code === 'string' ? body.code : typeof err?.code === 'string' ? (err.code as string) : undefined;
  const params = isPlainObject(body.params) ? body.params : isPlainObject(err?.params) ? (err!.params as Record<string, unknown>) : undefined;
  return { ...(code ? { code } : {}), ...(params ? { params } : {}) };
}
