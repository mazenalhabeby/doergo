import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * The gateway's rate limits, in two families.
 *
 * ANONYMOUS — a request with no bearer token, or any `@Public()` route (login,
 * refresh, forgot/reset-password, invitations, the signing link, the ICS feed,
 * the operator's own sign-in). Counted per client IP, which is the only identity
 * such a request has. These are the limits that existed before, unchanged.
 *
 * MEMBER — a signed-in request, counted per USER once the token is validated
 * (`MemberThrottlerGuard`, after `JwtAuthGuard`). Per IP was wrong for these: an
 * office behind one NAT shares an address, and a single page load fires a burst
 * of reads, so the 10-per-second tier answered 429 to somebody simply opening the
 * dashboard and the client paid a second in retries. The short window fits a page
 * load; the 10-second and 60-second guards are scaled with it.
 *
 * Both families count PER ROUTE (the library's key is controller + handler +
 * throttler name + tracker), and a route's own `@Throttle()` still applies to
 * either family — `default` for the per-minute overrides, `short`/`medium`/`long`
 * for the few that tune those.
 *
 * ⚠️ The fourth throttler MUST be named `default`: every per-route `@Throttle()`
 * writes its override under the `default` key and @nestjs/throttler only reads an
 * override for a throttler whose name matches. Without it, every override (login
 * 5/min, forgot-password, invitation validate/accept…) is silently ignored.
 */
export const ANONYMOUS_THROTTLERS: ThrottlerOptions[] = [
  { name: 'short', ttl: 1_000, limit: 10 },
  { name: 'medium', ttl: 10_000, limit: 50 },
  { name: 'long', ttl: 60_000, limit: 200 },
  // Base matches 'long', so undecorated routes are unaffected; @Throttle tightens it.
  { name: 'default', ttl: 60_000, limit: 200 },
];

export const MEMBER_THROTTLERS: ThrottlerOptions[] = [
  { name: 'short', ttl: 1_000, limit: 30 },
  { name: 'medium', ttl: 10_000, limit: 150 },
  { name: 'long', ttl: 60_000, limit: 600 },
  { name: 'default', ttl: 60_000, limit: 600 },
];

/**
 * A ceiling per IP for requests that CARRY a bearer token, checked before the
 * token is validated.
 *
 * Without it, a flood of made-up tokens would skip the anonymous limits and reach
 * token validation (an RPC each) unthrottled. It counts every route together and
 * is set far above what a whole office's page loads add up to, so a shared NAT is
 * never refused by it — it is a flood net, not a fairness rule; fairness is the
 * per-user family above.
 */
export const BEARER_FLOOD_NET: ThrottlerOptions[] = [
  { name: 'net-short', ttl: 1_000, limit: 150, setHeaders: false },
  { name: 'net-medium', ttl: 10_000, limit: 1_000, setHeaders: false },
  { name: 'net-long', ttl: 60_000, limit: 4_000, setHeaders: false },
];
