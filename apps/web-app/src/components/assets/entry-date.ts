import { assetEntryDateText, type AssetEntryDateKeys } from "@hbcfield/shared/client"

/**
 * The web's keys for the shared asset-entry date refusals.
 *
 * The rule, the days a picker offers and the English sentence all live in
 * shared (`assets/entry-date.ts`); the server refuses with that sentence and
 * the phone says it under `logbook.*`. Only WHERE the web's catalogue keeps
 * the translations is decided here.
 */
export const WEB_ENTRY_DATE_KEYS: AssetEntryDateKeys = {
  future: "assetLog.dateFuture",
  "too-old": "assetLog.dateTooOld",
  unreadable: "assetLog.problem.notADate",
}

type Translate = (key: string, fallback: string, options?: Record<string, unknown>) => string

/** Why this day will not be accepted, in the reader's language — or null. */
export function entryDateText(
  t: Translate,
  dayKey: string,
  opts: { canManageAssets?: boolean; now?: Date } = {},
): string | null {
  return assetEntryDateText(t, WEB_ENTRY_DATE_KEYS, dayKey, opts)
}
