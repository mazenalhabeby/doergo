/**
 * What an hour costs, and what an hour is billed at.
 *
 * ⚠️ SOME COMPANIES HAVE ONE RATE AND SOME HAVE TWO, and the product must not
 * ask which. A plumber charges €85 an hour and that is the whole story. A
 * staffing agency pays Ahmed €20 and bills the client €40, and the gap between
 * them is the business. Forcing the first company to think about "cost" is a
 * column of dashes they have to ignore forever; forcing the second to fake it
 * in one field loses the number they actually manage.
 *
 * So the mode is DISCOVERED, not configured — see `usesTwoRates`. The moment a
 * cost rate exists anywhere, there is a margin worth showing; until then there
 * is not, and nobody had to find a setting either way.
 *
 * Both rates resolve through the same ladder, INDEPENDENTLY. That independence
 * is what makes the agency case need no special mode at all: leave Ahmed's bill
 * rate blank and the client's contract rate wins it, set his cost rate and that
 * wins the other. Different rungs, one mechanism.
 *
 * ⚠️ EVERY LEVEL IS NULLABLE AND NULL MEANS INHERIT — never zero. Zero is a
 * real rate of nothing, and one typed into the wrong box bills a client €0
 * without a word. The two are kept distinguishable all the way down.
 *
 * Everything here is integer CENTS and pure. Money in floating point is a
 * rounding bug waiting for a large total, and a pure resolver is what lets the
 * invoice, the preview, the reports and the phone agree about one number.
 */
export {
  type RateKind,
  type RateLevel,
  RATE_LEVELS,
  COST_ON_PROFILE_MESSAGE,
  PRICE_ON_WORKSPACE_MESSAGE,
  LEVELS_BY_KIND,
  type RatePair,
  type RateSources,
  type ResolvedRate,
  resolveRate,
  explainRate,
  usesTwoRates,
  marginCents,
  lineTotals,
  snapshotRates,
} from './rate-ladder/resolve';
export {
  stripLabourCost,
  MAX_RATE_CENTS,
  cleanRateCents,
  mayViewLabourCost,
  stripCostRates,
} from './rate-ladder/labour-cost';
