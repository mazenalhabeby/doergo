/**
 * Rates over time.
 *
 * ⚠️ A RATE CHANGE NEVER REWRITES THE PAST. Raising the Mechanic day rate from
 * $200 to $220 "from 1 November" adds a dated row; every day worked before
 * 1 November is still priced at $200 — on an invoice raised today, next week or
 * next year. Writing the new number over the old one would silently re-price
 * work that a client may already have agreed to, and the first person to notice
 * is holding two documents that disagree.
 *
 * Issued invoices were already safe (each line keeps its own copy of the rate),
 * but work that had not been invoiced yet was not: a draft raised after a change
 * picked up the new rate for old days. Pricing every piece of work by the rate
 * in force ON THE DAY IT WAS DONE closes that gap, and it is one rule for hours
 * and days alike.
 *
 * Everything here is pure: the services load the rows, these functions decide.
 */
export {
  type RateTargetKind,
  type RateHistoryKind,
  type RateHistoryRow,
  parseDayKey,
  dayKeyOfDate,
  dayKeyIn,
  rateSeriesKey,
  RateBook,
} from './rate-history/book';
export {
  RATE_BACKDATE_MAX_DAYS,
  SINCE_ALWAYS,
  RATE_FUTURE_MAX_DAYS,
  rateStartProblem,
  utcTodayKey,
  planRateChange,
  RateChangeError,
} from './rate-history/change';
