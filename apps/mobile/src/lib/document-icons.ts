import type { IconName } from '@hbcfield/shared/client';

/**
 * A glyph for a document type.
 *
 * Types are org-defined, so there is no enum to switch on — the stable thing is
 * the KEY, which the starter catalogue fixes for the eleven types most
 * organizations begin with and which anything hand-made inherits the shape of.
 *
 * Matched on substrings rather than exact keys because an organization that
 * renames "driving_licence" to "driving_licence_c1e" should not silently drop
 * back to a blank page icon. Unknown stays deliberately generic: a wrong icon
 * that looks confident is worse than an honest sheet of paper.
 *
 * Here, not in the sheet that first needed it, because the same mapping belongs
 * on the requirements list and the review queue the moment either grows icons.
 */
export function documentTypeIcon(key: string | null | undefined): IconName {
  const k = (key ?? '').toLowerCase();

  if (k.includes('passport')) return 'globe';
  if (k.includes('licence') || k.includes('license') || k.includes('driving')) return 'car';
  if (k.includes('id_card') || k.includes('identity') || k.includes('id')) return 'card';
  if (k.includes('payslip') || k.includes('salary') || k.includes('pay')) return 'expense';
  if (k.includes('contract')) return 'file';
  if (k.includes('first_aid') || k.includes('medical') || k.includes('health')) return 'medical';
  if (k.includes('safety') || k.includes('insurance')) return 'shield';
  if (k.includes('training') || k.includes('course')) return 'school';
  if (k.includes('certificate') || k.includes('cert') || k.includes('trade')) return 'certificate';
  if (k.includes('reference')) return 'chat';
  if (k.includes('statement') || k.includes('annual')) return 'reports';
  if (k.includes('warning')) return 'alertLine';

  return 'file';
}
