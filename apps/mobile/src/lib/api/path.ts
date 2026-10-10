/**
 * An API path with its parameters ENCODED — the one way to build one.
 *
 *   path`/tasks/${taskId}/crew/${action}`
 *
 * ⚠️ Every value is a SEGMENT. An id with a `/`, `?` or `#` in it (a deep link,
 * a push payload, a server answer — none of which this app controls) used to
 * become a different endpoint: `/tasks/../users/me` or `/documents/x?y`. Each
 * interpolated value now goes through `encodeURIComponent`, so it can only ever
 * be the segment it was put in.
 *
 * Query strings are not built here — `buildUrlWithQuery` encodes those.
 * `api-path-guard.spec.ts` fails if a request path is interpolated by hand.
 */
export function path(strings: TemplateStringsArray, ...values: Array<string | number>): string {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    out += encodeURIComponent(String(values[i])) + (strings[i + 1] ?? '');
  }
  return out;
}
