'use client';

import { monthGrid } from './time-logic';
import type { useRequestSheet } from './use-request-sheet';
import type { RequestSheet } from './time-off-section';

/** What RequestSheet works out after its early returns, moved here unchanged; called from the same place. */
export function RequestSheetView({
  now,
  month,
}: {
  now: Parameters<typeof RequestSheet>[0]['now'];
  month: ReturnType<typeof useRequestSheet>['month'];
}) {
  const grid = monthGrid(month.getFullYear(), month.getMonth());
  const canBack = month > new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return { grid, canBack };
}
