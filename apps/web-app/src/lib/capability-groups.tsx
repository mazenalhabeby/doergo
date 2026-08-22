import { MapPin, ClipboardCheck, Users, Boxes, KanbanSquare, Receipt, Share2 } from 'lucide-react';
import { MODULE_MONTHLY_CENTS } from '@hbcfield/shared/client';
import type { ReactNode } from 'react';

/**
 * The module catalogue, grouped by the JOB each capability does.
 *
 * Modules are named after what they are — "Custom Fields", "Story Points" —
 * which is right inside the product and useless to somebody deciding whether to
 * buy. These groups are the same catalogue in the buyer's words, and they exist
 * in ONE place because the home page and the pricing page were about to grow two
 * copies that would drift the first time a module moved.
 *
 * Titles and bodies live in i18n under `home.groups.*` — where they were first
 * written, and where all five translations already are. Renaming the namespace
 * would touch five locale files to change nothing a reader can see.
 *
 * `office` carries add-ons rather than modules: those are bought once for the
 * organization, not per space, and the price shown for it is a "from".
 */

export type CapabilityGroup = {
  key: string;
  icon: ReactNode;
  /** Module keys, in the order they should read. Empty for the add-on group. */
  modules: string[];
  /** Add-on keys — only the `office` group has these. */
  addOns?: string[];
  /** Counted modules explain themselves in words; the ladder is not a first impression. */
  hasNote?: boolean;
};

const ICON = 'h-4 w-4';

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  { key: 'where', icon: <MapPin className={ICON} />, modules: ['tracking', 'time_tracking'] },
  { key: 'prove', icon: <ClipboardCheck className={ICON} />, modules: ['service_reports', 'checklists', 'attachments'] },
  { key: 'clients', icon: <Users className={ICON} />, modules: ['crm', 'b2c_portal'], hasNote: true },
  { key: 'things', icon: <Boxes className={ICON} />, modules: ['assets'], hasNote: true },
  { key: 'plan', icon: <KanbanSquare className={ICON} />, modules: ['phases', 'epics', 'sprints', 'story_points', 'subtasks', 'dependencies', 'custom_fields'] },
  {
    key: 'office',
    icon: <Receipt className={ICON} />,
    modules: [],
    addOns: ['invoicing', 'recurring', 'shift_scheduling', 'audit_log'],
    hasNote: true,
  },
  { key: 'share', icon: <Share2 className={ICON} />, modules: ['space_sharing'], hasNote: true },
];

/** The six the home page leads with; `share` is a niche last card that belongs on the full page. */
export const HOME_GROUPS = CAPABILITY_GROUPS.slice(0, 6);

/** What switching a whole group on costs per space, in cents. */
export function groupMonthlyCents(g: CapabilityGroup): number {
  return g.modules.reduce((n, k) => n + (MODULE_MONTHLY_CENTS[k] ?? 0), 0);
}

/**
 * Every module in the catalogue reaches exactly one group.
 *
 * A module added to `AVAILABLE_MODULES` and forgotten here would simply vanish
 * from a page whose whole promise is "every price" — silently, and only on the
 * page a customer checks before paying. The pricing page asserts against this.
 */
export function ungroupedModuleKeys(allKeys: string[]): string[] {
  const grouped = new Set(CAPABILITY_GROUPS.flatMap((g) => g.modules));
  return allKeys.filter((k) => !grouped.has(k));
}
