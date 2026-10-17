/**
 * Semantic registry — the ONLY source of truth for what a report can query.
 *
 * Every dimension/measure carries a trusted SQL fragment (authored here, never
 * from the client). The query engine interpolates ONLY these fragments; all
 * user-supplied values (date ranges, filter values) are bound as parameters.
 * That combination is what makes dynamic reporting injection-safe.
 *
 * ⚠️ A field names a `labelKey`, never a sentence. Its words, in all five
 * languages, live in `REPORT_LABELS` (@hbcfield/shared) — the web table, the
 * CSV/PDF and the scheduled email each render the column in their reader's
 * language from that one catalogue. The English `label` still sent alongside
 * is READ from the catalogue, so there is one English spelling as well.
 */

export type { Dimension, Measure, Dataset } from './registry-parts/dataset-types';
export { DATASETS } from './registry-parts/datasets';
export { datasetCatalog } from './registry-parts/catalog';
