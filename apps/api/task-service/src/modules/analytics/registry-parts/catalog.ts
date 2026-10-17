/** Moved here unchanged from registry.ts. */
import { reportLabelEn } from '@hbcfield/shared';
import { DATASETS } from './datasets';

/**
 * Client-safe catalog (no SQL) for the report builder UI.
 *
 * Carries the key AND the English label: the web names each entry in its own
 * language from the key, and a reader that does not translate (a web build
 * from before the keys) still has words.
 */
export function datasetCatalog() {
  return Object.values(DATASETS).map((d) => ({
    key: d.key,
    labelKey: d.labelKey,
    label: reportLabelEn(d.labelKey),
    dimensions: Object.entries(d.dimensions).map(([key, v]) => ({
      key,
      labelKey: v.labelKey,
      label: reportLabelEn(v.labelKey),
      type: v.type,
    })),
    measures: Object.entries(d.measures).map(([key, v]) => ({
      key,
      labelKey: v.labelKey,
      label: reportLabelEn(v.labelKey),
      format: v.format,
    })),
  }));
}
