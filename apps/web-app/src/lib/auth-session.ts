/**
 * The browser's session — the access token, kept IN MEMORY only.
 *
 * ⚠️ The access token never touches localStorage. It used to be written there
 * "for reload persistence", which handed a working credential to any script
 * that ever ran on the origin, and kept it on disk after the tab closed. A
 * reload now asks the gateway for a fresh one with the httpOnly refresh cookie
 * (`POST /auth/refresh`) — the one credential script cannot read.
 *
 * Tabs talk over ONE BroadcastChannel (`hbc-auth`):
 *   • `token`       — a tab refreshed or signed in; others adopt the token rather
 *                     than each rotating the refresh cookie themselves;
 *   • `request-token` / reply — a tab that just loaded asks the others first;
 *   • `signed-out`  — sign-out (or a refused refresh) ends the session everywhere;
 *   • `identity`    — somebody ELSE signed in on this browser: every other tab
 *                     clears its cache and reloads instead of showing one
 *                     person's data under another person's token.
 * Where BroadcastChannel does not exist the `storage` event carries the
 * non-secret messages (signed-out, identity) — never the token.
 *
 * Refresh outcomes are three, and only one of them ends the session:
 *   • `ok`          — new token in memory;
 *   • `ended`       — the gateway REFUSED it (401/403): the session is over;
 *   • `unavailable` — 5xx, timeout, offline: retried with backoff, and the
 *                     session is KEPT. A gateway restart must not sign out
 *                     every open tab.
 */
import { AUTH_BASE_URL } from "./endpoints"

export type RefreshOutcome = "ok" | "ended" | "unavailable"
export type SessionEndReason = "expired" | "suspended" | "signed-out"

export type SessionEvent =
  | { type: "token"; token: string }
  | { type: "ended"; reason: SessionEndReason; message?: string }
  | { type: "identity-changed"; userId: string | null }

type ChannelMessage =
  | { type: "token"; token: string; sub: string | null; from: string }
  | { type: "request-token"; from: string }
  | { type: "signed-out"; from: string }
  | { type: "identity"; sub: string | null; from: string }

export const AUTH_CHANNEL_NAME = "hbc-auth"
/** A NON-secret hint that a session may exist, so anonymous visits skip the refresh call. */
export const SESSION_HINT_KEY = "hbc-auth-session"
const STORAGE_EVENT_KEY = "hbc-auth-event"
/** Removed on load: the access token from before it moved into memory. */
const LEGACY_KEYS = ["hbcfield_access_token", "hbcfield_refresh_token"]

/** The gateway's suspension refusal (shared `ORG_SUSPENDED_CODE` / message). */
const ORG_SUSPENDED_CODE = "ORGANIZATION_SUSPENDED"
const SUSPENDED_PATTERN = /deactivated|suspended/i

const REFRESH_TIMEOUT_MS = 15_000
const REFRESH_RETRY_DELAYS_MS = [1_000, 2_000, 4_000]
const TOKEN_REQUEST_WAIT_MS = 150

// ── state ──────────────────────────────────────────────────────────────────
let accessToken: string | null = null
let refreshInFlight: Promise<RefreshOutcome> | null = null
const listeners = new Set<(e: SessionEvent) => void>()
const tabId = Math.random().toString(36).slice(2) + Date.now().toString(36)
let channel: BroadcastChannel | null = null
let channelReady = false
let sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ── JWT helpers (payload only — never trusted, only used for timing / identity) ─
export function decodeJwtPayload(token: string | null): { exp?: number; sub?: string } | null {
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

const subOf = (token: string | null) => decodeJwtPayload(token)?.sub ?? null

export function tokenExpiresWithin(token: string | null, seconds: number): boolean {
  const exp = decodeJwtPayload(token)?.exp
  if (!exp) return true
  return exp * 1000 - Date.now() < seconds * 1000
}

// ── storage (hint flag + fallback channel only) ─────────────────────────────
function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null
  }
}

function setHint(on: boolean) {
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

// ── events ─────────────────────────────────────────────────────────────────
export function onSessionEvent(listener: (e: SessionEvent) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(e: SessionEvent) {
  for (const l of [...listeners]) {
    try {
      l(e)
    } catch {
      /* a listener's failure is its own */
    }
  }
}

// ── cross-tab channel ──────────────────────────────────────────────────────
function post(msg: ChannelMessage) {
  ensureChannel()
  if (channel) {
    try {
      channel.postMessage(msg)
    } catch {
      /* closed */
    }
    return
  }
  // Fallback: the storage event. NEVER the token — only what carries no secret.
  if (msg.type === "token" || msg.type === "request-token") return
  const s = safeStorage()
  try {
    s?.setItem(STORAGE_EVENT_KEY, JSON.stringify({ ...msg, at: Date.now() }))
    s?.removeItem(STORAGE_EVENT_KEY)
  } catch {
    /* ignore */
  }
}

function handleMessage(msg: ChannelMessage | null | undefined) {
  if (!msg || typeof msg !== "object" || msg.from === tabId) return
  switch (msg.type) {
    case "request-token":
      if (accessToken && !tokenExpiresWithin(accessToken, 30)) {
        post({ type: "token", token: accessToken, sub: subOf(accessToken), from: tabId })
      }
      return
    case "token": {
      const mine = subOf(accessToken)
      if (mine && msg.sub && mine !== msg.sub) {
        accessToken = null
        emit({ type: "identity-changed", userId: msg.sub })
        return
      }
      accessToken = msg.token
      setHint(true)
      emit({ type: "token", token: msg.token })
      return
    }
    case "identity": {
      const mine = subOf(accessToken)
      if (mine && mine !== msg.sub) {
        accessToken = null
        emit({ type: "identity-changed", userId: msg.sub })
      }
      return
    }
    case "signed-out":
      if (accessToken) {
        accessToken = null
        emit({ type: "ended", reason: "signed-out" })
      }
      return
  }
}

function ensureChannel() {
  if (channelReady || typeof window === "undefined") return
  channelReady = true
  // One-time cleanup of the token that used to be kept on disk.
  const s = safeStorage()
  for (const k of LEGACY_KEYS) {
    try {
      s?.removeItem(k)
    } catch {
      /* ignore */
    }
  }
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(AUTH_CHANNEL_NAME)
      channel.onmessage = (ev: MessageEvent) => handleMessage(ev.data as ChannelMessage)
      return
    } catch {
      channel = null
    }
  }
  window.addEventListener("storage", (ev: StorageEvent) => {
    if (ev.key !== STORAGE_EVENT_KEY || !ev.newValue) return
    try {
      handleMessage(JSON.parse(ev.newValue))
    } catch {
      /* ignore */
    }
  })
}

// ── token store ────────────────────────────────────────────────────────────
export function getAccessToken(): string | null {
  ensureChannel()
  return accessToken
}

export function hasAccessToken(): boolean {
  return !!getAccessToken()
}

/**
 * A new token for THIS tab, shared with the others. When it belongs to a
 * different person than the one other tabs show, they are told so.
 */
export function setAccessToken(token: string, opts: { broadcast?: boolean } = {}): void {
  ensureChannel()
  const previousSub = subOf(accessToken)
  accessToken = token
  setHint(true)
  if (opts.broadcast === false) return
  const sub = subOf(token)
  if (previousSub !== sub) post({ type: "identity", sub, from: tabId })
  post({ type: "token", token, sub, from: tabId })
}

/** Forget the session here and (by default) in every other tab. */
export function clearSession(opts: { broadcast?: boolean } = {}): void {
  ensureChannel()
  accessToken = null
  setHint(false)
  if (opts.broadcast !== false) post({ type: "signed-out", from: tabId })
}

// ── refresh ────────────────────────────────────────────────────────────────
function looksSuspended(body: unknown): boolean {
  const b = body as { code?: unknown; message?: unknown } | null
  if (b?.code === ORG_SUSPENDED_CODE) return true
  const msg = Array.isArray(b?.message) ? b?.message.join(" ") : b?.message
  return typeof msg === "string" && SUSPENDED_PATTERN.test(msg)
}

async function refreshOnce(): Promise<{ outcome: RefreshOutcome; reason?: SessionEndReason; message?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
  try {
    // The refresh token rides in the httpOnly cookie; nothing is read from JS.
    const res = await fetch(`${AUTH_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Platform": "web" },
      credentials: "include",
      body: "{}",
      signal: controller.signal,
    })
    const body = await res.json().catch(() => null)
    if (res.status === 401 || res.status === 403) {
      const suspended = res.status === 403 && looksSuspended(body)
      return {
        outcome: "ended",
        reason: suspended ? "suspended" : "expired",
        message: typeof body?.message === "string" ? body.message : undefined,
      }
    }
    const token = body?.data?.accessToken
    if (res.ok && typeof token === "string" && token) {
      setAccessToken(token)
      return { outcome: "ok" }
    }
    // Any other answer (5xx, 429, a malformed 200) says nothing about the session.
    return { outcome: "unavailable" }
  } catch {
    return { outcome: "unavailable" }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Get a new access token with the refresh cookie. One at a time per tab;
 * transient failures are retried with backoff and never end the session.
 *
 * `announce: false` is for the boot check — finding no session on a fresh
 * visit is not a session that ENDED, so nobody is redirected for it.
 */
export function refreshAccessToken(opts: { announce?: boolean } = {}): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight
  const announce = opts.announce !== false
  refreshInFlight = (async () => {
    try {
      for (let attempt = 0; ; attempt++) {
        const r = await refreshOnce()
        if (r.outcome === "ok") return "ok"
        if (r.outcome === "ended") {
          const hadSession = !!accessToken || hasSessionHint()
          clearSession()
          if (announce && hadSession) emit({ type: "ended", reason: r.reason ?? "expired", message: r.message })
          return "ended"
        }
        if (attempt >= REFRESH_RETRY_DELAYS_MS.length) return "unavailable"
        await sleep(REFRESH_RETRY_DELAYS_MS[attempt])
      }
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

/** Ask the other tabs for their token before rotating the cookie ourselves. */
function requestTokenFromOtherTabs(): Promise<boolean> {
  ensureChannel()
  if (!channel) return Promise.resolve(false)
  return new Promise((resolve) => {
    const off = onSessionEvent((e) => {
      if (e.type === "token") {
        off()
        clearTimeout(timer)
        resolve(true)
      }
    })
    const timer = setTimeout(() => {
      off()
      resolve(false)
    }, TOKEN_REQUEST_WAIT_MS)
    post({ type: "request-token", from: tabId })
  })
}

/**
 * On page load: a token from another open tab, else a refresh with the cookie.
 * Anonymous visitors (no hint) are not asked to make a request that can only 401.
 */
export async function restoreSession(): Promise<RefreshOutcome> {
  if (accessToken) return "ok"
  if (!hasSessionHint()) return "ended"
  if (await requestTokenFromOtherTabs()) return "ok"
  return refreshAccessToken({ announce: false })
}

/**
 * A token good for at least the next `minSeconds` — refreshed first if not.
 * For handshakes (the socket) that would otherwise present an expired token.
 */
export async function getFreshAccessToken(minSeconds = 30): Promise<string | null> {
  if (accessToken && !tokenExpiresWithin(accessToken, minSeconds)) return accessToken
  if (!accessToken && !hasSessionHint()) return null
  await refreshAccessToken()
  return accessToken
}

// ── test seam ───────────────────────────────────────────────────────────────
/** @internal Reset module state between unit tests. */
export function __resetAuthSessionForTests(opts: { sleep?: (ms: number) => Promise<void> } = {}): void {
  accessToken = null
  refreshInFlight = null
  listeners.clear()
  try {
    channel?.close()
  } catch {
    /* ignore */
  }
  channel = null
  channelReady = false
  if (opts.sleep) sleep = opts.sleep
}
