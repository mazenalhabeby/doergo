/**
 * An API path with its parameters ENCODED — now the shared core's `path`
 * (packages/shared/src/http/core/path.ts), the same function the endpoint
 * table builds every route with. Kept as a module so `path` imports outside the
 * API layer (a device's own route, a test) keep working.
 *
 * ⚠️ Every value is a SEGMENT: an id with a `/`, `?` or `#` in it can only ever
 * be the segment it was put in. A request path is never written by hand in this
 * app — it comes from `apiEndpoints` (api-path-guard.spec.ts).
 */
export { path, withQuery } from '@hbcfield/shared/client';
