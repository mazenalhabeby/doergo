/**
 * What a space costs, and what an organization pays.
 *
 * Two halves, answering two different questions:
 *
 *   USERS  — €9.99 each, everybody the same. How many people use the product.
 *   SPACES — the sum of the modules switched on in that space. Switch one on
 *            and the space costs more; switch it off and it costs less.
 *
 *     bill = users × seat price
 *          + Σ spaces ( Σ enabled modules ( price + ladder(count in that space) ) )
 *
 * A couple of modules carry a count whose size IS the value — assets is the
 * first — and cost their base here plus a volume ladder in usage-pricing.ts.
 * The ladder is per space, like everything else about a module, so a space's
 * price stays the sum of what THAT space switched on and can be checked from
 * the screen it is shown on.
 *
 * One flat seat means nothing has to decide whether somebody is an "office" or
 * a "field" user — a whole category of argument, and of code, that simply does
 * not exist.
 *
 * Every price is monthly EUR **cents**. Integers, because money in floating
 * point is a rounding bug waiting for a large invoice.
 *
 * Every module has a price, including the cheap ones. A space pays for exactly
 * what it switched on, so a site that never opens an attachment is not carrying
 * the storage bill for one that does — and every toggle moves the number, so
 * there is no switch that silently does nothing.
 *
 * The numbers live in ONE table. Changing a price is a one-line edit that the
 * estimator, the billing screen and the invoice all pick up together.
 */
export {
  SEAT_MONTHLY_CENTS,
  OBSERVER_SEAT_MONTHLY_CENTS,
  MODULE_MONTHLY_CENTS,
  moduleMonthlyCents,
  type SpaceCostLine,
  type SpaceCost,
  spaceMonthlyCost,
  type SpaceModules,
} from './module-pricing/space';
export { type OrgCostBreakdown, orgMonthlyCost, moduleQuantities, formatCents } from './module-pricing/org';
