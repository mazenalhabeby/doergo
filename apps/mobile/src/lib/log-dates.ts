import {
  assetEntryDayBounds,
  assetEntryOccurredAt,
  assetEntryDateText as entryDateText,
  localDayFromKey,
  localDayKey,
  type AssetEntryDateKeys,
} from '@hbcfield/shared/client';

/**
 * Calendar days for anything filed against an asset, on the phone — a logbook
 * entry and a receipt alike.
 *
 * The rules are in shared (`assets/entry-date.ts`): the days a calendar offers,
 * the instant a picked day is filed at, what the server refuses and the words
 * it refuses with. These are the phone's names for them, and the phone's keys.
 *
 * Pure (no React Native), so the bounds the calendar greys out are pinned by a
 * spec against the same rule the server refuses by.
 */

/** A local day as "YYYY-MM-DD". */
export const dayKeyOf = localDayKey;

/** Local midnight of a "YYYY-MM-DD", or null for anything that is not a real day. */
export const dateFromDayKey = localDayFromKey;

/** The days an entry may be dated with, as the calendar offers them. */
export const logEntryDayBounds = assetEntryDayBounds;

/** The instant an entry chosen for a day is filed at: now for today, local midday before. */
export const occurredAtForDay = assetEntryOccurredAt;

/** Where the phone's catalogue keeps the shared refusals. */
export const PHONE_ENTRY_DATE_KEYS: AssetEntryDateKeys = {
  future: 'logbook.dateFuture',
  'too-old': 'logbook.dateTooOld',
  unreadable: 'logbook.badDate',
};

type Translate = (key: string, fallback: string, options?: Record<string, unknown>) => string;

/**
 * Why this day will not be accepted, as the member reads it — or null.
 *
 * ⚠️ ONE sentence for the logbook and the receipt screen, and the same words as
 * the server's refusal. A date read off a receipt is set without the calendar
 * ever being opened, so the check has to run at send too — and an old slip
 * refused in one wording on the phone and another by the server reads as two
 * different problems.
 */
export function assetEntryDateText(
  t: Translate,
  dayKey: string,
  opts: { canManageAssets?: boolean; now?: Date } = {},
): string | null {
  return entryDateText(t, PHONE_ENTRY_DATE_KEYS, dayKey, opts);
}
