/**
 * Worker labor cost — what the ORG pays a worker (internal costing), the single
 * source of truth shared by the monthly cost view and the future invoice system.
 *
 * Fully per-worker and dynamic:
 *   • HOURLY → `costRateCents` is € per hour, multiplied by hours worked that month
 *   • FIXED  → `costRateCents` is € per month, charged flat while the worker is active
 *   • unset  → not costed (0, excluded from totals)
 *
 * Money is integer EUR **cents** everywhere to avoid float rounding.
 */

export type CostType = 'HOURLY' | 'FIXED';

/** The minimal cost config carried on a worker. */
export interface WorkerCostConfig {
  costType?: string | null; // 'HOURLY' | 'FIXED' | null
  costRateCents?: number | null;
}

/** Whether a worker has a usable cost configured. */
export function hasWorkerCost(w: WorkerCostConfig): boolean {
  return (
    (w.costType === 'HOURLY' || w.costType === 'FIXED') &&
    typeof w.costRateCents === 'number' &&
    w.costRateCents > 0
  );
}

/**
 * A worker's cost for ONE month, in EUR cents.
 *   • HOURLY → round(rate × hoursThisMonth)
 *   • FIXED  → the flat monthly rate (hours ignored)
 *   • unset / invalid → 0
 * `hoursThisMonth` is the actual worked hours for the period (from attendance).
 */
export function workerMonthlyCostCents(
  w: WorkerCostConfig,
  hoursThisMonth: number,
): number {
  if (!hasWorkerCost(w)) return 0;
  const rate = w.costRateCents as number;
  if (w.costType === 'HOURLY') {
    const hours = Number.isFinite(hoursThisMonth) && hoursThisMonth > 0 ? hoursThisMonth : 0;
    return Math.round(rate * hours);
  }
  // FIXED
  return rate;
}
