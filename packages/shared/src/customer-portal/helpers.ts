/**
 * @hbcfield/shared — customer-portal helpers (pure, client-safe).
 */
import type { IntakeCategory, PortalTemplate } from './types';
import { PORTAL_TEMPLATES } from './templates';

/** Resolve a built-in template by key (rental | logistics | workplace). */
export function resolvePortalTemplate(key: string): PortalTemplate | undefined {
  return PORTAL_TEMPLATES[key];
}

/**
 * Expand a template into IntakeCategory seed rows (minus id/organizationId,
 * which the persistence layer fills in). Used when enabling the portal for an org.
 */
export function templateToIntakeCategories(
  template: PortalTemplate,
): Array<Omit<IntakeCategory, 'id' | 'organizationId'>> {
  return template.categories.map((c) => ({
    key: c.key,
    label: c.label,
    icon: c.icon ?? null,
    color: c.color ?? null,
    urgent: c.urgent,
    team: c.team ?? null,
    defaultPriority: c.defaultPriority ?? null,
    issues: c.issues ?? [],
    position: c.position,
    isActive: c.isActive ?? true,
    spaceId: c.spaceId ?? null,
  }));
}

/**
 * The priority a task should get from its intake category:
 * explicit defaultPriority → else URGENT if the category is flagged urgent →
 * else MEDIUM. Keeps "Emergency"/"Safety"/"Not Arrived" auto-escalating.
 */
export function priorityForCategory(
  cat: { urgent?: boolean; defaultPriority?: string | null } | null | undefined,
): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
  const p = cat?.defaultPriority?.toUpperCase();
  if (p === 'LOW' || p === 'MEDIUM' || p === 'HIGH' || p === 'URGENT') return p;
  if (cat?.urgent) return 'URGENT';
  return 'MEDIUM';
}

/** Build a human request title from a category + optional issue. */
export function requestTitle(categoryLabel: string, issue?: string | null): string {
  const trimmed = (issue ?? '').trim();
  return trimmed ? `${categoryLabel} — ${trimmed}` : categoryLabel;
}
