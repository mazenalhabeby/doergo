/**
 * The date anything filed against an asset may carry — a logbook entry, an
 * expense sent from a phone, a line the office types onto the Money tab.
 *
 * ⚠️ ONE RULE, BECAUSE THEY ARE ONE TABLE. A fuel slip sent through "Add a
 * receipt" and a Fuel entry sent through the logbook are both `AssetMoney`
 * rows, read by the same totals and the same queue. They used to be dated by
 * two copies of "120 days back, a day forward" — and the receipt copy exempted
 * nobody, so the office could type last year's service into the logbook and
 * was refused last year's invoice for the same van. Two rules for one row are
 * how "why did this one go through" becomes a support ticket.
 *
 * Pure and dependency-light: the server refuses by it, the phone's calendar and
 * the web's date picker grey out days by it, and the specs pin all three to it.
 */

import { assetManageSpaces } from './record';

/**
 * A member's day-to-day backdating window. The office may record history from
 * further back — last year's service, typed in the day the logbook is switched
 * on — which is exactly what makes the due dates right from the start.
 *
 * Here rather than in a service because the calendar greys out the same days
 * the server refuses: a day offered and then refused after a round trip on one
 * bar of signal is the form lying about what it will take.
 */
export const ASSET_ENTRY_BACKDATE_DAYS = 120;

/**
 * How far past "now" an entry may be dated: one day. Not zero, because a phone
 * whose clock runs a few minutes ahead, or a member a time zone east of the
 * server, would otherwise be refused an entry made this minute.
 */
export const ASSET_ENTRY_FUTURE_GRACE_MS = 86_400_000;

const DAY_MS = 86_400_000;

export type AssetEntryDateProblem = 'future' | 'too-old';

/**
 * Why an entry may not carry this date, or null when it may.
 *
 * Something that happened: a reminder of the future is a due rule, not an entry.
 *
 * `canManageAssets` is the ORG-WIDE grant (see `assetEntryDateExempt`), which
 * is what the server is handed as `req.user.canManageAssets`.
 */
export function assetEntryDateProblem(
  at: Date,
  opts: { canManageAssets?: boolean; now?: Date } = {},
): AssetEntryDateProblem | null {
  const now = (opts.now ?? new Date()).getTime();
  const t = at.getTime();
  if (t > now + ASSET_ENTRY_FUTURE_GRACE_MS) return 'future';
  if (!opts.canManageAssets && now - t > ASSET_ENTRY_BACKDATE_DAYS * DAY_MS) return 'too-old';
  return null;
}

/**
 * Is this member exempt from the backdating window?
 *
 * ⚠️ ORG-WIDE ONLY, and deliberately so. Every route that files an entry reads
 * the flat `req.user.canManageAssets`, which is the org-wide resolution; a
 * Space Manager's grant in their own depot does not reach it. Offering a
 * year-old day to somebody the server holds to 120 would be a day chosen and
 * then refused — so the clients ask exactly what the server is handed.
 * `assetManageSpaces` answers `null` for precisely that: an admin, the column,
 * or a pre-capability token carrying `canManageUsers`.
 */
export function assetEntryDateExempt(user: Parameters<typeof assetManageSpaces>[0]): boolean {
  return assetManageSpaces(user) === null;
}

/** A date that will not do — the rule's two answers, plus a day that is not a day. */
export type AssetEntryDayProblem = AssetEntryDateProblem | 'unreadable';

/**
 * The sentence a refusal says, in English — the server's, and the fallback the
 * clients' translations are written from (`logbook.date*` on the phone,
 * `assetLog.date*` on the web). One wording, so a date refused on the phone and
 * the same date refused by the server read as one refusal, not two problems.
 */
export function assetEntryDateMessage(problem: AssetEntryDayProblem): string {
  switch (problem) {
    case 'future': return 'An entry cannot be dated in the future';
    case 'too-old': return `An entry older than ${ASSET_ENTRY_BACKDATE_DAYS} days has to be filed by the office`;
    case 'unreadable': return 'That date could not be read';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar days, as a person picks them
// ─────────────────────────────────────────────────────────────────────────────

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A local day as "YYYY-MM-DD".
 *
 * `toISOString().slice(0, 10)` is the tempting shortcut and it is wrong for an
 * evening in Vienna: at 00:30 on the 15th it answers the 14th, so a form would
 * open on yesterday and "Today" would select a day that is not today.
 */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a "YYYY-MM-DD", or null for anything that is not a real day ("2026-02-30"). */
export function localDayFromKey(key: string | null | undefined): Date | null {
  const m = KEY.exec((key ?? '').trim());
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  return d.getMonth() === +m[2]! - 1 && d.getDate() === +m[3]! ? d : null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** `days` calendar days before a local day — by the calendar, so a DST change cannot shift it by an hour into the next day. */
const daysBefore = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - days);

/**
 * The days an entry may be dated with, as a calendar offers them.
 *
 * Never after today: the server allows a day's grace for clocks and time zones,
 * but a member choosing tomorrow on purpose is filing a plan, not an entry.
 *
 * A member reaches back `ASSET_ENTRY_BACKDATE_DAYS - 1` days, not the full
 * window. A past day is sent as its local midday (`assetEntryOccurredAt`), and
 * the oldest full-window day's midday is already outside the window by the
 * afternoon — offering it would be offering a day the server then refuses.
 * Somebody exempt types in history, so they have no lower bound.
 */
export function assetEntryDayBounds(
  now: Date,
  opts: { canManageAssets?: boolean } = {},
): { minDate?: Date; maxDate: Date } {
  const today = startOfDay(now);
  return opts.canManageAssets
    ? { maxDate: today }
    : { minDate: daysBefore(today, ASSET_ENTRY_BACKDATE_DAYS - 1), maxDate: today };
}

/**
 * The instant an entry chosen for `dayKey` is filed at.
 *
 * Today is NOW — two entries logged this morning keep their order, and "latest
 * reading" is decided by date. A past day is its local midday: half a day from
 * both of its edges, so no time zone between here and the server can move it
 * onto a neighbouring date. (`new Date("2026-09-10")` is UTC midnight, which is
 * the evening of the 9th anywhere west of Greenwich — and custody is asked of
 * that instant.)
 */
export function assetEntryOccurredAt(dayKey: string, now: Date): Date | null {
  const day = localDayFromKey(dayKey);
  if (!day) return null;
  if (localDayKey(day) === localDayKey(now)) return new Date(now.getTime());
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
}

/**
 * Why a picked DAY will not be accepted, or null — the form's question.
 *
 * The day is turned into the instant it would be filed at first
 * (`assetEntryOccurredAt`), and the rule is asked of THAT, so a form can never
 * accept a day the server then refuses. Needed at send and not only in the
 * calendar: a date read off a receipt is set without the calendar being opened.
 */
export function assetEntryDayProblem(
  dayKey: string,
  opts: { canManageAssets?: boolean; now?: Date } = {},
): AssetEntryDayProblem | null {
  const now = opts.now ?? new Date();
  const at = assetEntryOccurredAt(dayKey, now);
  if (!at) return 'unreadable';
  return assetEntryDateProblem(at, { canManageAssets: opts.canManageAssets, now });
}

/** Where each refusal lives in an app's translation catalogue. */
export type AssetEntryDateKeys = Record<AssetEntryDayProblem, string>;

/**
 * Why a picked day will not be accepted, as a person reads it — or null.
 *
 * The app supplies its translator and its keys; the English fallback is always
 * `assetEntryDateMessage`, so an untranslated screen still says the server's
 * words. One implementation for the phone's receipt screen, the phone's
 * logbook and the web's log dialog, which is what keeps their sentences equal.
 */
export function assetEntryDateText(
  t: (key: string, fallback: string, options?: Record<string, unknown>) => string,
  keys: AssetEntryDateKeys,
  dayKey: string,
  opts: { canManageAssets?: boolean; now?: Date } = {},
): string | null {
  const problem = assetEntryDayProblem(dayKey, opts);
  if (!problem) return null;
  return t(keys[problem], assetEntryDateMessage(problem), { count: ASSET_ENTRY_BACKDATE_DAYS });
}
