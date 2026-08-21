import { AVAILABLE_MODULES, AVAILABLE_ADD_ONS } from '@hbcfield/shared/client';

/**
 * Human-readable labels for raw feature keys.
 *
 * Built from the two catalogues rather than hand-listed. The hand-written map
 * this replaces had drifted: it still named `multi_org`, a feature that was
 * removed, and gave `service_reports` a label mentioning assets, which became a
 * module of its own. A label list maintained by hand is a list that goes stale
 * the first time somebody adds a feature and forgets it.
 */
const CATALOGUE_LABELS: Record<string, string> = {
  ...Object.fromEntries(AVAILABLE_MODULES.map((m) => [m.key as string, m.label])),
  ...Object.fromEntries(AVAILABLE_ADD_ONS.map((a) => [a.key, a.label])),
};

export const planFeatureLabel = (key: string): string =>
  CATALOGUE_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
