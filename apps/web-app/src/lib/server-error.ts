import type { TFunction } from "i18next"

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
export interface ServerError extends Error {
  code?: string
  params?: Record<string, unknown>
}

/**
 * Attach a refusal's code and params to the Error being thrown.
 *
 * Kept separate from constructing the Error so the ~400 existing
 * `throw new Error(response.error)` call sites keep working untouched; a call
 * site opts in by using this instead.
 */
export function apiError(response: { error?: string; errorCode?: string; errorParams?: Record<string, unknown> }): ServerError {
  const err = new Error(response.error || "Request failed") as ServerError
  if (response.errorCode) err.code = response.errorCode
  if (response.errorParams) err.params = response.errorParams
  return err
}

/**
 * The sentence to show for a failed request.
 *
 * Translates when the refusal carries a code this app knows, and otherwise
 * returns the server's own text — which is the honest fallback: an English
 * sentence that describes the problem beats a translated one that does not.
 */
export function serverErrorMessage(error: unknown, t: TFunction): string {
  const e = error as ServerError | undefined
  const fallback = e?.message || t("common.error", "Something went wrong")
  if (!e?.code) return fallback

  const key = `serverErrors.${e.code}`
  const translated = t(key, { ...(e.params ?? {}), defaultValue: "" })
  return typeof translated === "string" && translated.length > 0 ? translated : fallback
}
