import type { TFunction } from "i18next"
import { ApiError, isApiError } from "@hbcfield/shared/client"
import { isTransportMessage } from "./transport-messages"
import { refusalSentence, translateRefusal } from "./refusal-text"

/**
 * Saying a server refusal in the reader's language.
 *
 * Server messages are written where no locale is known — a German screen asks to
 * add a day off and is answered "This overlaps an existing time-off entry for the
 * employee". There are around 200 such strings across the services, so this is
 * deliberately incremental: a refusal that carries a `code` is translated, and
 * every one that does not still shows its English text exactly as before.
 *
 * The error object is whatever was thrown. Codes and params ride along as
 * properties rather than being parsed out of the message, because a message is
 * prose and prose changes.
 */

/** An Error that came from the API, possibly carrying a refusal code. */
interface ServerError extends Error {
  code?: string
  params?: Record<string, unknown>
  /** HTTP status of the answer; 0 = no answer (network, timeout). */
  status?: number
}

/**
 * Make an ApiError's `message` the reader's language WHEN IT IS READ.
 *
 * Most screens toast `e.message` (`onError: (e) => notify.error(e.message)`), so
 * a code that only `serverErrorMessage` knew about reached a German reader in
 * English. The message is resolved lazily — the language can change between the
 * refusal and the toast — and falls back to the server's own sentence, kept as
 * `serverMessage`, when the catalogue has no entry for the code.
 */
export function localizeApiError<E extends ApiError>(e: E): E {
  if (!e.code || Object.prototype.hasOwnProperty.call(e, "serverMessage")) return e
  const raw = e.message
  Object.defineProperty(e, "serverMessage", { value: raw, enumerable: false })
  Object.defineProperty(e, "message", {
    configurable: true,
    enumerable: false,
    get: () => translateRefusal(e.code, e.params) ?? raw,
  })
  return e
}

/**
 * The failure a `lib/api` method throws: the ApiError the request rejected
 * with (code, params and status intact), or one rebuilt from a result shape.
 *
 * ⚠️ `throw new Error(response.error)` — once written ~420 times in lib/api —
 * dropped the refusal's code and params, so no screen could translate it.
 */
export function apiError(response: {
  error?: string
  errorCode?: string
  errorParams?: Record<string, unknown>
  status?: number
  cause?: unknown
}): ApiError {
  if (isApiError(response.cause)) {
    // A caller may have replaced the sentence (`{ ...res, error: 'Upload failed' }`) — honour it.
    const cause = response.cause
    if (response.error && response.error !== cause.message && !cause.code) {
      return new ApiError(response.error, { status: cause.status, kind: cause.kind })
    }
    return localizeApiError(cause)
  }
  const status = typeof response.status === "number" ? response.status : 0
  const kind =
    status > 0 ? "http" : response.errorCode === "TIMEOUT" ? "timeout" : response.errorCode === "ABORTED" ? "aborted" : "network"
  return localizeApiError(
    new ApiError(response.error || "Request failed", {
      status,
      kind,
      ...(response.errorCode ? { code: response.errorCode } : {}),
      ...(response.errorParams ? { params: response.errorParams } : {}),
    }),
  )
}

/**
 * Is this failure worth asking again? Only when nothing was decided: no answer
 * at all (network / timeout), the rate limiter, or the server failing. A 4xx is
 * an answer — asking again gets the same one. An error without a known status
 * (a bare Error) is NOT retried.
 */
export function isTransientError(error: unknown): boolean {
  const e = error as { status?: unknown; code?: unknown } | null
  if (e?.code === "NETWORK" || e?.code === "TIMEOUT") return true
  if (isTransportMessage((error as { message?: unknown } | null)?.message)) return true
  const status = typeof e?.status === "number" ? e.status : undefined
  if (status === undefined) return false
  return status === 0 || status === 429 || status >= 500
}

/**
 * The sentence to show for a failed request.
 *
 * Translates when the refusal carries a code this app knows, and otherwise
 * returns the server's own text — which is the honest fallback: an English
 * sentence that describes the problem beats a translated one that does not.
 */
export function serverErrorMessage(error: unknown, t: TFunction, locale?: string): string {
  const e = error as (ServerError & { serverMessage?: string }) | undefined
  const fallback = e?.serverMessage || e?.message || t("common.error", "Something went wrong")
  if (!e?.code) return fallback
  return refusalSentence(e.code, e.params, t as unknown as (k: string, o: Record<string, unknown>) => unknown, locale) ?? fallback
}
