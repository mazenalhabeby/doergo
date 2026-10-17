/**
 * The session's stateless parts: message shapes, keys and timings, JWT payload
 * reading, the hint flag. The STATE (the token, the refresh in flight, the
 * channel) stays in auth-session.ts — one module owns it.
 */
export type RefreshOutcome = "ok" | "ended" | "unavailable"

export type SessionEndReason = "expired" | "suspended" | "signed-out"

export type SessionEvent =
  | { type: "token"; token: string }
  | { type: "ended"; reason: SessionEndReason; message?: string }
  | { type: "identity-changed"; userId: string | null }

export type ChannelMessage =
  | { type: "token"; token: string; sub: string | null; from: string }
  | { type: "request-token"; from: string }
  | { type: "signed-out"; from: string }
  | { type: "identity"; sub: string | null; from: string }

export const AUTH_CHANNEL_NAME = "hbc-auth"

/** A NON-secret hint that a session may exist, so anonymous visits skip the refresh call. */
export const SESSION_HINT_KEY = "hbc-auth-session"

export const STORAGE_EVENT_KEY = "hbc-auth-event"

/** Removed on load: the access token from before it moved into memory. */
export const LEGACY_KEYS = ["hbcfield_access_token", "hbcfield_refresh_token"]

/** The gateway's suspension refusal (shared `ORG_SUSPENDED_CODE` / message). */
export const ORG_SUSPENDED_CODE = "ORGANIZATION_SUSPENDED"

export const SUSPENDED_PATTERN = /deactivated|suspended/i

export const REFRESH_TIMEOUT_MS = 15_000

export const REFRESH_RETRY_DELAYS_MS = [1_000, 2_000, 4_000]

export const TOKEN_REQUEST_WAIT_MS = 150

// ── JWT helpers (payload only — never trusted, only used for timing / identity) ─
export function decodeJwtPayload(
  token: string | null | undefined,
): { exp?: number; iat?: number; sub?: string } | null {
  if (!token) return null
  try {
    const part = token.split(".")[1]
    if (!part) return null
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/")
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export const subOf = (token: string | null) => decodeJwtPayload(token)?.sub ?? null

export function tokenExpiresWithin(token: string | null, seconds: number): boolean {
  const exp = decodeJwtPayload(token)?.exp
  if (!exp) return true
  return exp * 1000 - Date.now() < seconds * 1000
}

// ── storage (hint flag + fallback channel only) ─────────────────────────────
export function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null
  }
}

export function setHint(on: boolean) {
  const s = safeStorage()
  try {
    if (on) s?.setItem(SESSION_HINT_KEY, "1")
    else s?.removeItem(SESSION_HINT_KEY)
  } catch {
    /* private mode — the hint is an optimisation only */
  }
}

/** Might there be a session to restore? (No token is stored; this is a flag.) */
export function hasSessionHint(): boolean {
  try {
    return safeStorage()?.getItem(SESSION_HINT_KEY) === "1"
  } catch {
    return false
  }
}

// ── refresh ────────────────────────────────────────────────────────────────
export function looksSuspended(body: unknown): boolean {
  const b = body as { code?: unknown; message?: unknown } | null
  if (b?.code === ORG_SUSPENDED_CODE) return true
  const msg = Array.isArray(b?.message) ? b?.message.join(" ") : b?.message
  return typeof msg === "string" && SUSPENDED_PATTERN.test(msg)
}
