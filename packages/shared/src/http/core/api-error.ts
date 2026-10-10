import { isPlainObject } from './envelope';

/**
 * Why a request has no answer to give.
 *
 * - `http`    — the server answered and refused (4xx/5xx). `status` is its status.
 * - `network` — nothing answered: no signal, DNS, a refused connection, or a
 *               session refresh that could not reach the server. `status` 0.
 * - `timeout` — something was there but did not answer in time. `status` 0.
 * - `aborted` — the CALLER cancelled (a newer search replaced this one). Not an
 *               error to show anybody. `status` 0.
 * - `parse`   — a 2xx whose body is not JSON. Proves nothing about the request.
 */
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'aborted' | 'parse';

/** Stable codes for the failures that never reached a server (the web's existing names). */
export const TRANSPORT_CODES = {
  network: 'NETWORK',
  timeout: 'TIMEOUT',
  aborted: 'ABORTED',
  parse: 'UNREADABLE_RESPONSE',
  /** A 401 whose refresh could not reach the server: the session is kept. */
  sessionUnreachable: 'SESSION_UNREACHABLE',
  /** A 401 whose refresh the server refused: the session is over. */
  sessionEnded: 'SESSION_ENDED',
} as const;

/** The sentences a request with no answer carries, unless the app supplies its own (the phone's are translated). */
export const DEFAULT_TRANSPORT_MESSAGES = {
  network: 'Unable to reach the server. Please check your connection and try again.',
  timeout: 'The server took too long to answer. Please try again.',
  aborted: 'Request was cancelled.',
  parse: 'The server sent an answer that could not be read.',
} as const;

export interface ApiErrorInit {
  status: number;
  kind: ApiErrorKind;
  code?: string;
  params?: Record<string, unknown>;
  /** A validation refusal's individual messages, when the server sent a list. */
  messages?: string[];
  retryable?: boolean;
}

/** Statuses that say "not now" rather than "no". */
const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

/**
 * The one error every app's requests reject with.
 *
 * ⚠️ It never carries a request or response BODY, a URL with its query, or a
 * token — an error object is what crash reporters and consoles print.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  /** The server's machine-readable reason (e.g. TASK_REASSIGNED), or a transport code. */
  readonly code?: string;
  /** The values the server's sentence is written with — what a translated refusal is filled from. */
  readonly params?: Record<string, unknown>;
  readonly messages?: string[];
  /** Worth asking again later: network, timeout, 408/429/502/503/504. */
  readonly retryable: boolean;

  constructor(message: string, init: ApiErrorInit) {
    super(message);
    this.name = 'ApiError';
    this.status = init.status;
    this.kind = init.kind;
    if (init.code) this.code = init.code;
    if (init.params) this.params = init.params;
    if (init.messages) this.messages = init.messages;
    this.retryable =
      init.retryable ??
      (init.kind === 'network' || init.kind === 'timeout' || (init.kind === 'http' && RETRYABLE_STATUSES.has(init.status)));
    // Keep `instanceof` working when compiled to ES5-style classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** The phone's old name for `status` — kept so its call sites migrate unchanged. */
  get statusCode(): number {
    return this.status;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError || (!!e && typeof e === 'object' && (e as { name?: unknown }).name === 'ApiError' && typeof (e as { kind?: unknown }).kind === 'string');
}

/**
 * The server's refusal, read from the gateway's error JSON:
 *
 *   GlobalExceptionFilter → { statusCode, message: string | string[], error, code?, params?, timestamp, path }
 *   shared `error()`      → { success: false, error: { code, message, details? } }
 *
 * A body that is not an object (a proxy's HTML page, nothing at all) keeps the
 * status and a generic sentence.
 */
export function toApiError(body: unknown, status: number): ApiError {
  let message: string | undefined;
  let messages: string[] | undefined;
  let code: string | undefined;
  let params: Record<string, unknown> | undefined;

  if (isPlainObject(body)) {
    const nested = isPlainObject(body.error) ? body.error : null;
    const raw = body.message ?? nested?.message;
    if (typeof raw === 'string') message = raw;
    else if (Array.isArray(raw)) {
      messages = raw.filter((m): m is string => typeof m === 'string');
      message = messages.join(', ');
    }
    code = typeof body.code === 'string' ? body.code : typeof nested?.code === 'string' ? nested.code : undefined;
    params = isPlainObject(body.params) ? body.params : isPlainObject(nested?.params) ? (nested!.params as Record<string, unknown>) : undefined;
    // `error` as a string is the HTTP reason phrase ("Bad Request") — only a last resort.
    if (!message && typeof body.error === 'string') message = body.error;
  }

  return new ApiError(message || defaultHttpMessage(status), {
    status,
    kind: 'http',
    ...(code ? { code } : {}),
    ...(params ? { params } : {}),
    ...(messages && messages.length ? { messages } : {}),
  });
}

function defaultHttpMessage(status: number): string {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'You do not have access to this.';
  if (status === 404) return 'Not found.';
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (status >= 500) return 'The server could not complete this request.';
  return 'Request failed';
}
