import type { TFunction } from "i18next"
import { distanceRefusalParams } from "@hbcfield/shared/client"
import { isTransportMessage } from "./http-client"

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
 * Attach a refusal's code and params to the Error being thrown.
 *
 * Kept separate from constructing the Error so the ~400 existing
 * `throw new Error(response.error)` call sites keep working untouched; a call
 * site opts in by using this instead.
 */
export function apiError(response: { error?: string; errorCode?: string; errorParams?: Record<string, unknown>; status?: number }): ServerError {
  const err = new Error(response.error || "Request failed") as ServerError
  if (response.errorCode) err.code = response.errorCode
  if (response.errorParams) err.params = response.errorParams
  if (typeof response.status === "number") err.status = response.status
  return err
}

/**
 * Is this failure worth asking again? Only when nothing was decided: no answer
 * at all (network / timeout), the rate limiter, or the server failing. A 4xx is
 * an answer — asking again gets the same one. An error without a known status
 * (most call sites still throw a bare Error) is NOT retried.
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
  const e = error as ServerError | undefined
  const fallback = e?.message || t("common.error", "Something went wrong")
  if (!e?.code) return fallback

  const key = `serverErrors.${e.code}`
  /*
    A distance refusal sends metres (`distanceMetres`, `radiusMetres`); the
    sentence reads them as a person says them — "9,631 km", "100 m" — through
    the ONE shared formatter, in the reader's language.
  */
  const params = e.params ?? {}
  const distances = "distanceMetres" in params || "radiusMetres" in params ? distanceRefusalParams(params, locale) : {}
  const translated = t(key, { ...params, ...distances, defaultValue: "" })
  return typeof translated === "string" && translated.length > 0 ? translated : fallback
}
