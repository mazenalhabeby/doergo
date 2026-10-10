import { buildUrlWithQuery } from '../../utils/query';

/**
 * An API path with its parameters ENCODED — the one way to build one.
 *
 *   path`/tasks/${taskId}/crew/${action}`
 *
 * ⚠️ Every value is a SEGMENT. An id with a `/`, `?` or `#` in it (a deep link,
 * a push payload, a server answer — none of which an app controls) used to
 * become a different endpoint: `/tasks/../users/me` or `/documents/x?y`. Each
 * interpolated value goes through `encodeURIComponent`, so it can only ever be
 * the segment it was put in.
 *
 * The phone's and the admin console's copies of this are the same function;
 * this is the one they move onto. Query strings are not built here — `withQuery`.
 */
export function path(strings: TemplateStringsArray, ...values: ReadonlyArray<string | number>): string {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    out += encodeURIComponent(String(values[i])) + (strings[i + 1] ?? '');
  }
  return out;
}

/**
 * A path with a query string from the DEFINED, non-empty values of `params`
 * (shared `buildUrlWithQuery`: null, undefined and '' are dropped; every key
 * and value is encoded by URLSearchParams; arrays are joined with commas).
 * A path that already carries a query is appended to with `&`.
 */
export function withQuery(base: string, params?: object | null): string {
  if (!params) return base;
  const built = buildUrlWithQuery('', params);
  if (!built) return base;
  // buildUrlWithQuery('', p) → "?a=1"
  return base.includes('?') ? `${base}&${built.slice(1)}` : `${base}${built}`;
}
