/**
 * The ONE way the console talks to the API.
 *
 * Everything that used to be repeated per call lives here once: the base URL,
 * the token, JSON only when there is a body, a timeout, the error shape, the
 * `{ data }` envelope, and what a 401 means (the session is over — every screen
 * goes back to sign-in, not just the one that happened to ask).
 */

/** The API base. Same-origin `/api/v1` in production (admin.hbcfield.com proxies it). */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/$/, '');

/**
 * Socket.IO origin: NEXT_PUBLIC_SOCKET_URL when set (local dev, where the
 * socket server is its own port), else the API's origin — '' = same origin,
 * which is production (nginx routes /socket.io/ on admin.hbcfield.com).
 */
export const SOCKET_ORIGIN = (process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE.replace(/\/api\/v\d+$/, '')).replace(/\/$/, '');

/** Fired on window when the server says the session is over (any 401). */
export const SESSION_EXPIRED_EVENT = 'platform:session-expired';
/** Fired when the server says this session may only enrol a second factor. */
export const ENROLMENT_REQUIRED_EVENT = 'platform:enrolment-required';
export const ENROLMENT_REQUIRED_CODE = 'PLATFORM_2FA_ENROLMENT_REQUIRED';

const DEFAULT_TIMEOUT_MS = 20_000;
const TOKEN_KEY = 'platformToken';
const TOKEN_AT_KEY = 'platformTokenAt';

// ── Token: held in memory, mirrored to sessionStorage (dies with the tab) ─────
let token = '';
let tokenAt = 0;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getToken(): string {
  if (!token) {
    const s = storage();
    token = s?.getItem(TOKEN_KEY) ?? '';
    tokenAt = Number(s?.getItem(TOKEN_AT_KEY) ?? 0) || 0;
  }
  return token;
}

/** When the current token was received (ms) — the console refreshes it before it runs out. */
export function getTokenAt(): number {
  getToken();
  return tokenAt;
}

export function setToken(next: string): void {
  token = next;
  tokenAt = Date.now();
  const s = storage();
  try {
    s?.setItem(TOKEN_KEY, next);
    s?.setItem(TOKEN_AT_KEY, String(tokenAt));
  } catch {
    /* private mode: memory only */
  }
}

export function clearToken(): void {
  token = '';
  tokenAt = 0;
  const s = storage();
  try {
    s?.removeItem(TOKEN_KEY);
    s?.removeItem(TOKEN_AT_KEY);
  } catch {
    /* nothing stored */
  }
}

// ── Errors ────────────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof ApiError || e instanceof Error) return e.message || fallback;
  return fallback;
}

// ── Paths: every parameter encoded, always ────────────────────────────────────
/**
 * A path tag: `path\`/platform/orgs/${id}/suspend\`` encodes `id` with
 * encodeURIComponent. A raw id in a template literal is how "../" or "?x="
 * ends up re-routing a request.
 */
export function path(strings: TemplateStringsArray, ...values: Array<string | number>): string {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? encodeURIComponent(String(values[i])) : ''), '');
}

/** A query string from defined, non-empty values only. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ── The request ───────────────────────────────────────────────────────────────
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * false for sign-in: a 401 there means "wrong password", not "your session
   * ended", and must not bounce the screen it came from.
   */
  session?: boolean;
}

/** The whole JSON body. Use `request` unless you need more than `data` (a cursor). */
export async function requestRaw<T = unknown>(p: string, opts: RequestOptions = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timed out', 'TimeoutError')), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => ctrl.abort(opts.signal?.reason);
  opts.signal?.addEventListener('abort', onAbort, { once: true });

  const headers: Record<string, string> = { Accept: 'application/json' };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const hasBody = opts.body !== undefined;
  if (hasBody) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${p}`, {
      method: opts.method ?? (hasBody ? 'POST' : 'GET'),
      headers,
      body: hasBody ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e; // the caller cancelled — not an error to show
    if (ctrl.signal.aborted) throw new ApiError(0, 'The server did not answer in time');
    throw new ApiError(0, 'Cannot reach the server');
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof json?.message === 'string' ? json.message : Array.isArray(json?.message) ? json.message.join(', ') : `HTTP ${res.status}`;
    const code = typeof json?.code === 'string' ? json.code : undefined;
    if (res.status === 401 && opts.session !== false) {
      clearToken();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    if (res.status === 403 && code === ENROLMENT_REQUIRED_CODE && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(ENROLMENT_REQUIRED_EVENT));
    }
    throw new ApiError(res.status, message, code);
  }
  return json as T;
}

/** `data` from the `{ data }` envelope. */
export async function request<T>(p: string, opts: RequestOptions = {}): Promise<T> {
  const json = await requestRaw<{ data?: T }>(p, opts);
  return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T;
}

/** A cursor page: `{ data, nextCursor }`. */
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}
export async function requestPage<T>(p: string, opts: RequestOptions = {}): Promise<Page<T>> {
  const json = await requestRaw<{ data?: T[]; nextCursor?: string | null }>(p, opts);
  return { data: json?.data ?? [], nextCursor: json?.nextCursor ?? null };
}

/** Was this rejection the caller cancelling (a newer search replaced it)? */
export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
