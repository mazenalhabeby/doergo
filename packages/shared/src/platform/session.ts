/**
 * Operator-console sessions — the rules both the auth-service (which mints and
 * validates platform tokens) and the gateway (which guards platform routes)
 * read, so the two cannot drift. Browser-safe: no Node imports.
 */

/**
 * How long one platform token lives.
 *
 * Short on purpose: the console slides it forward (`POST /platform/auth/refresh`)
 * while somebody is actually working, so a token copied out of a browser — or a
 * laptop left open — is worthless half an hour later. The idle sign-out in the
 * console uses the same number, so the server and the screen agree on "idle".
 */
export const PLATFORM_TOKEN_TTL_SECONDS = 30 * 60;

/**
 * The longest a session may be slid forward from the moment the password (and
 * code) were typed. After this the operator signs in again, whatever they were
 * doing — a refresh chain must not turn one sign-in into a permanent credential.
 */
export const PLATFORM_SESSION_MAX_SECONDS = 12 * 60 * 60;

/** Refusal code: this session may only enrol a second factor (and sign out). */
export const PLATFORM_2FA_ENROLMENT_REQUIRED = 'PLATFORM_2FA_ENROLMENT_REQUIRED';

/**
 * Does this platform role have to hold a second factor before it may do
 * anything but enrol one?
 *
 * Every role. The console reaches every customer's data (SUPPORT reads tickets
 * and members; BILLING and CONTROLLER move money and switch companies off), so
 * there is no operator for whom a password alone is enough. Kept as a function
 * of the role so a future read-only role could be exempted in ONE place.
 */
export function platformRequiresTwoFactor(_role: string | null | undefined): boolean {
  return true;
}

/** Is this operator's session limited to enrolling a second factor? */
export function platformEnrolmentRequired(user: { role?: string | null; twoFactorEnabled?: boolean | null }): boolean {
  return platformRequiresTwoFactor(user.role) && !user.twoFactorEnabled;
}

/** May a session first authenticated at `authTimeSec` still be slid forward at `nowMs`? */
export function mayRefreshPlatformSession(authTimeSec: number | null | undefined, nowMs: number = Date.now()): boolean {
  if (typeof authTimeSec !== 'number' || !Number.isFinite(authTimeSec)) return false;
  return nowMs / 1000 - authTimeSec < PLATFORM_SESSION_MAX_SECONDS;
}

/**
 * The session cut-off a sign-out writes.
 *
 * `tokensValidAfter` is compared at whole-second precision and a token minted IN
 * the cut-off's second is still accepted (so the sign-in straight after a reset
 * works). A sign-out therefore moves the cut-off past the second the signing-out
 * token was minted in — otherwise a token issued and signed out within one
 * second would survive its own sign-out.
 */
export function platformLogoutCutoff(iatSeconds: number | null | undefined, nowMs: number = Date.now()): Date {
  const pastToken = typeof iatSeconds === 'number' ? (iatSeconds + 1) * 1000 : 0;
  return new Date(Math.max(nowMs, pastToken));
}

/**
 * Which Host headers may reach the platform routes.
 *
 * `PLATFORM_ALLOWED_HOSTS` (comma-separated, e.g. "admin.hbcfield.com"). Unset or
 * empty = no restriction, which is what local development needs. Ports are
 * ignored and the comparison is case-insensitive.
 */
export function parsePlatformAllowedHosts(csv: string | null | undefined): string[] {
  return String(csv ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function platformHostAllowed(hostHeader: unknown, allowedCsv: string | null | undefined): boolean {
  const allowed = parsePlatformAllowedHosts(allowedCsv);
  if (allowed.length === 0) return true;
  const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (typeof raw !== 'string' || !raw) return false;
  // "[::1]:4000" → "[::1]", "admin.hbcfield.com:443" → "admin.hbcfield.com"
  const host = raw.trim().toLowerCase().replace(/:\d+$/, '');
  return allowed.includes(host);
}

/** A support team's colour: exactly `#rrggbb`. Anything else is refused, not stored. */
export function isTeamColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}
