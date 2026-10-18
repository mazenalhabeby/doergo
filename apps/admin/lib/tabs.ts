import type { Cap } from './api/types';

export type TabKey = 'orgs' | 'revenue' | 'pricing' | 'library' | 'support' | 'teams' | 'team' | 'audit';

/**
 * The console's tabs, and the capability each needs — one table, read by the
 * header (what to show) and the shell (what to render). A tab whose data the
 * server would refuse is not offered: the Revenue tab reads billing alerts,
 * which need `manageOrgs`, so a support agent never sees it.
 */
const TABS: ReadonlyArray<{ key: TabKey; label: string; cap: Cap }> = [
  { key: 'orgs', label: 'Organizations', cap: 'view' },
  { key: 'revenue', label: 'Revenue', cap: 'manageOrgs' },
  { key: 'pricing', label: 'Pricing', cap: 'view' },
  { key: 'library', label: 'Task-type library', cap: 'manageLibrary' },
  { key: 'support', label: 'Support', cap: 'manageSupport' },
  { key: 'teams', label: 'Support Teams', cap: 'manageSupportTeams' },
  { key: 'team', label: 'Team', cap: 'managePlatformUsers' },
  { key: 'audit', label: 'Audit', cap: 'viewPlatformAudit' },
];

export function tabsFor(permissions: readonly Cap[]) {
  return TABS.filter((t) => permissions.includes(t.cap));
}
