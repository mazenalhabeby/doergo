import { parseClientLocale, SUPPORTED_LOCALES } from "@hbcfield/shared/client"
import { supportedLanguages } from "@/i18n/languages"

/**
 * "Language for emails" on a client record — the form's side of it.
 *
 * The choices are the languages the SERVER accepts (`SUPPORTED_LOCALES`), not
 * the ones this app happens to display, so the select can never offer a value
 * the save then refuses. Each is named in its own language, the way a language
 * picker is read: the person choosing may be setting it for a client whose
 * language they do not speak.
 *
 * The first option is "" — not set — and means "same as the organization": the
 * server resolves it at send time (the client's own account, then the
 * organization's country, then English), so nothing is guessed into the record.
 */
const NAMES: Record<string, string> = Object.fromEntries(supportedLanguages.map((l) => [l.code, l.label]))

export const CLIENT_LOCALE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = SUPPORTED_LOCALES.map((code) => ({
  value: code,
  label: NAMES[code] ?? code,
}))

/** The select's value for a record: its language, or "" when none is set. */
export function clientLocaleFormValue(customer?: { locale?: string | null } | null): string {
  const parsed = parseClientLocale(customer?.locale ?? null)
  return parsed.ok && parsed.locale ? parsed.locale : ""
}

/** What a save sends: the chosen language, or null to clear it. */
export function clientLocalePayload(value: string): string | null {
  const parsed = parseClientLocale(value)
  return parsed.ok ? parsed.locale : null
}

/** A language's own name for the record's details, or null when none is set. */
export function clientLocaleName(locale?: string | null): string | null {
  const value = clientLocaleFormValue({ locale })
  return value ? (NAMES[value] ?? value) : null
}
