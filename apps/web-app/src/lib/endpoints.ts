/**
 * Where the web app talks to — ONE place for every base URL.
 *
 * The API client, the sign-in calls, the socket, the geocoding proxy, the blog's
 * server-side fetch and the operator console each used to read the environment
 * themselves, with their own fallback — and three of those fallbacks were
 * `http://localhost:…`. In a production build a missing build argument then sent
 * a signed-in browser's traffic (and its credentials) to whatever answers on the
 * visitor's own machine, silently.
 *
 * The rule, everywhere:
 *   • a value set in the environment wins, exactly as written;
 *   • in development an unset value falls back to the local services;
 *   • in a PRODUCTION build an unset value falls back to the SAME ORIGIN —
 *     `/api/v1` and the page's own host for the socket — which is how production
 *     is served (nginx proxies `/api/` and `/socket.io/` to the gateway). It never
 *     falls back to localhost.
 *
 * ⚠️ `process.env.NEXT_PUBLIC_*` must be read LITERALLY (not through a computed
 * key): Next inlines them at build time by matching the source text.
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production"

/** Strip a trailing slash so `${base}${path}` never doubles it. */
function clean(value: string | undefined | null): string | undefined {
  const v = (value ?? "").trim()
  if (!v) return undefined
  return v.endsWith("/") ? v.slice(0, -1) : v
}

/**
 * The fallback rule, exported so it can be tested without rebuilding the app.
 * `undefined` as a result means "the page's own origin" (used by the socket).
 */
export function resolveEndpoint(
  configured: string | undefined | null,
  fallbacks: { development: string | undefined; production: string | undefined },
  production: boolean = IS_PRODUCTION,
): string | undefined {
  const set = clean(configured)
  if (set) return set
  return production ? fallbacks.production : fallbacks.development
}

/** Is this URL on the visitor's own machine? */
export function isLoopbackUrl(url: string | undefined | null): boolean {
  if (!url) return false
  return /^(https?|wss?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url.trim())
}

/** REST API — same-origin `/api/v1` unless configured (Next rewrites it in dev). */
export const API_BASE_URL: string =
  resolveEndpoint(process.env.NEXT_PUBLIC_API_URL, { development: "/api/v1", production: "/api/v1" }) ?? "/api/v1"

/**
 * Sign-in, refresh and sign-out. The refresh cookie must go to the server that
 * set it, so this follows the API unless configured separately.
 */
export const AUTH_BASE_URL: string =
  resolveEndpoint(process.env.NEXT_PUBLIC_AUTH_URL, { development: API_BASE_URL, production: API_BASE_URL }) ?? API_BASE_URL

/**
 * Socket.IO. `undefined` = connect to the page's own origin (production: nginx
 * proxies `/socket.io/`). Development talks to the notification service directly.
 */
export const SOCKET_URL: string | undefined = resolveEndpoint(process.env.NEXT_PUBLIC_SOCKET_URL, {
  development: "http://localhost:4001",
  production: undefined,
})

/**
 * The API as seen from the NEXT SERVER (blog pages render there, so a relative
 * URL has no origin to resolve against). An absolute configured API URL wins;
 * otherwise the proxy origin the rewrites use; otherwise the public site in
 * production and the local gateway in development.
 */
export function serverApiBaseUrl(): string {
  const configured = clean(process.env.NEXT_PUBLIC_API_URL)
  if (configured && /^https?:\/\//i.test(configured)) return configured
  const proxy = clean(process.env.API_PROXY_ORIGIN)
  if (proxy) return `${proxy}/api/v1`
  return IS_PRODUCTION ? "https://hbcfield.com/api/v1" : "http://localhost:4000/api/v1"
}
