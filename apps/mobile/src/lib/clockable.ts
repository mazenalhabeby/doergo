import type { CompanyLocation } from './api';

/**
 * The workspaces that would TAKE a clock-in now, from the status read.
 *
 * ⚠️ The status list is "where you work" (it also feeds the Time tab's places),
 * not "where you may clock in": it includes an assignment that starts next
 * week, or a workspace whose Time Tracking is off. Choosing from all of it
 * offered — and could silently auto-pick — a workspace the server then refused.
 * The server tags each one `clockable` with the clock-in check's own rule; a
 * list from an older server (no tag) is taken as it is.
 */
export function clockableLocations(list: readonly CompanyLocation[] | null | undefined): CompanyLocation[] {
  return (list ?? []).filter((l) => l.clockable !== false);
}
