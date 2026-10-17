/**
 * Modules that bill by how much you use them.
 *
 * Most modules are a switch: on costs €X a month, off costs nothing. A few are
 * not, because their value scales with a number the customer controls. Assets is
 * the first: a workshop tracking six machines and a landlord tracking six hundred
 * flats are not the same customer, and one price cannot be right for both — set
 * for the landlord it is unaffordable to the workshop; set for the workshop it
 * gives the landlord the product for nothing.
 *
 * So the module keeps its (small) base price, and the count is priced on top,
 * on a ladder that gets cheaper as it grows:
 *
 *     space bill = base + Σ bands ( units in band × band price )
 *
 * EVERYTHING IS PER SPACE — the base, the included units, and the ladder — and
 * that consistency is the point. The module is switched on per space and paid
 * for per space, so counting somewhere else to decide the rate makes the one
 * number on the screen impossible to check: the person looking at a space can
 * see what is in it, and cannot see what is in the others.
 *
 * An earlier version pooled the ladder across the organization, so a landlord
 * with five hundred flats over ten sites reached the cheap bands instead of
 * being billed as ten small customers. It is a real saving — around half — but
 * it cost the invariant every other module keeps, that a space's price is the
 * sum of what that space switched on, and it made the panel need two counts to
 * explain one number. Per space it still lands near €1.14 an asset at that
 * size, which is where per-unit software of this kind sits anyway.
 *
 * GRADUATED, like income tax: crossing into a cheaper band re-prices only the
 * units in that band, never the ones below it. The alternative — one rate for
 * the whole count, chosen by the total — makes the bill FALL when you add an
 * asset, which is indefensible on an invoice.
 *
 * WHY NOT PRICE BY ASSET TYPE — the obvious-looking alternative:
 *
 *   • The types are the customer's. They create "Apartments", "Vehicles",
 *     "Machines" themselves, name them, and reshape them. A price that depends
 *     on the type is a price the customer sets — rename the type, pay less.
 *   • The name predicts nothing. A machine with forty sub-parts and a fault-code
 *     catalogue costs us far more to serve than a flat worth €900 a month in
 *     rent. Type says nothing about either cost or value.
 *   • Where a type really does cost more, it is already priced. A type whose
 *     holder logs in bills through Client Portal; a type held by a customer
 *     bills through CRM. Charging again by type would be charging twice.
 *
 * Volume gives the fairness people actually want from per-type pricing — the
 * big user pays less per asset — without any of that.
 *
 * Every price is monthly EUR **cents**. Integers, because money in floating
 * point is a rounding bug waiting for a large invoice.
 */
export {
  type UsageBand,
  type UsagePrice,
  MODULE_USAGE_PRICING,
  includedUnits,
  usagePriceFor,
  billsByUsage,
  type UsageCostLine,
  type UsageCost,
  usageCost,
  marginalUnitCents,
} from './usage-pricing/ladders';
export {
  nextUsageBreak,
  BILLABLE_ASSET_WHERE,
  BILLABLE_CLIENT_WHERE,
  BILLABLE_PORTAL_WHERE,
} from './usage-pricing/billable';
