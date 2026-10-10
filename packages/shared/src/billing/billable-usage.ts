import { BILLABLE_ASSET_WHERE, BILLABLE_CLIENT_WHERE, BILLABLE_PORTAL_WHERE } from './usage-pricing';

/** One counted module's numbers for one organization. */
export interface ModuleUsageCounts {
  /** Everything counted, wherever it sits. */
  total: number;
  /** Records that belong to no space — billed by nobody, and worth surfacing. */
  unassigned: number;
  /** spaceId → how many. */
  spaces: Record<string, number>;
}

/** The database shape the count needs — any Prisma client (or transaction) satisfies it. */
export interface BillableUsageDb {
  assetCategory: { findMany(args: any): Promise<Array<{ id: string; spaceId: string | null }>> };
  asset: { groupBy(args: any): any };
  customer: { groupBy(args: any): any };
  portal: { groupBy(args: any): any };
}

type GroupRow = { _count: { _all: number } };

/** Group-by rows → per-space counts, given how a row finds its space. */
function fold<T extends GroupRow>(rows: T[], spaceOf: (row: T) => string | null): ModuleUsageCounts {
  const spaces: Record<string, number> = {};
  let unassigned = 0;
  let total = 0;
  for (const row of rows) {
    const units = row._count._all;
    total += units;
    const spaceId = spaceOf(row);
    if (spaceId) spaces[spaceId] = (spaces[spaceId] ?? 0) + units;
    else unassigned += units;
  }
  return { total, unassigned, spaces };
}

/**
 * How much of each usage-priced module every space holds — the counts the BILL
 * charges and the space's Modules tab shows.
 *
 * ⚠️ ONE function for both. auth-service (the bill) and task-service (the tab)
 * each ran these four queries; a count that drifts between the screen and the
 * invoice is the worst kind of bug to find. Exclusions come from the shared
 * `BILLABLE_*_WHERE` clauses.
 *
 * Four queries however many spaces, concurrently. Assets need the extra hop: an
 * asset reaches its space through its TYPE (category), and Prisma cannot group
 * by a relation's column, so their counts come back per type and are folded
 * onto spaces here. Clients and portals carry `spaceId` and group directly.
 */
export async function countBillableUsage(
  db: BillableUsageDb,
  organizationId: string,
): Promise<{ assets: ModuleUsageCounts; crm: ModuleUsageCounts; b2c_portal: ModuleUsageCounts }> {
  const [types, assetRows, clientRows, portalRows] = await Promise.all([
    db.assetCategory.findMany({ where: { organizationId }, select: { id: true, spaceId: true } }),
    db.asset.groupBy({ by: ['categoryId'], where: { ...BILLABLE_ASSET_WHERE, organizationId }, _count: { _all: true } }),
    db.customer.groupBy({ by: ['spaceId'], where: { ...BILLABLE_CLIENT_WHERE, organizationId }, _count: { _all: true } }),
    db.portal.groupBy({ by: ['spaceId'], where: { ...BILLABLE_PORTAL_WHERE, organizationId }, _count: { _all: true } }),
  ]);
  const spaceOfType = new Map(types.map((t) => [t.id, t.spaceId]));
  return {
    assets: fold(assetRows as Array<GroupRow & { categoryId: string | null }>, (r) =>
      r.categoryId ? spaceOfType.get(r.categoryId) ?? null : null,
    ),
    crm: fold(clientRows as Array<GroupRow & { spaceId: string | null }>, (r) => r.spaceId ?? null),
    b2c_portal: fold(portalRows as Array<GroupRow & { spaceId: string | null }>, (r) => r.spaceId ?? null),
  };
}
