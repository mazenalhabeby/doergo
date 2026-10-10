import { distanceRefusalParams } from "@hbcfield/shared/client"

/**
 * A coded server refusal, said in the reader's language.
 *
 * Kept free of the request pipeline and of the catalogue itself: the i18n
 * set-up registers its translator here (`setRefusalTranslator`), and an
 * `ApiError` built by `lib/server-error.ts` reads it when its message is shown.
 * Nothing here imports i18n, so a bundle that only reads errors does not grow.
 */

/** `t` as i18next has it — only the call this module makes. */
export type RefusalT = (key: string, options: Record<string, unknown>) => unknown

/**
 * The translated sentence for `code`, or undefined when the catalogue has none.
 *
 * A distance refusal sends metres (`distanceMetres`, `radiusMetres`); the
 * sentence reads them as a person says them — "9,631 km", "100 m" — through the
 * ONE shared formatter, in the reader's language.
 */
export function refusalSentence(
  code: string,
  params: Record<string, unknown> | undefined,
  t: RefusalT,
  locale?: string,
): string | undefined {
  const p = params ?? {}
  const distances = "distanceMetres" in p || "radiusMetres" in p ? distanceRefusalParams(p, locale) : {}
  const translated = t(`serverErrors.${code}`, { ...p, ...distances, defaultValue: "" })
  return typeof translated === "string" && translated.length > 0 ? translated : undefined
}

type Translator = (code: string, params: Record<string, unknown> | undefined) => string | undefined

let translator: Translator | null = null

/** Registered by `src/i18n/index.ts` once the catalogue exists; null in tests that have none. */
export function setRefusalTranslator(fn: Translator | null): void {
  translator = fn
}

/** The current language's sentence for a refusal code, or undefined. Never throws. */
export function translateRefusal(code: string | undefined, params?: Record<string, unknown>): string | undefined {
  if (!code || !translator) return undefined
  try {
    return translator(code, params)
  } catch {
    return undefined
  }
}
