/**
 * Free-form `{ label, value }` rows a client or an address carries ("Gate
 * code: 4471").
 *
 * The CRM and the portal each had their own copy of this sanitizer with the
 * same shape and different numbers. One function now; the numbers are the
 * caller's, because a client record and an apartment genuinely hold different
 * amounts — the rule for what counts as a row is not theirs to differ on.
 */
export interface LabelValueRow {
  label: string;
  value: string;
}

export interface LabelValueLimits {
  /** Characters kept of a label. */
  labelMax: number;
  /** Characters kept of a value. */
  valueMax: number;
  /** Rows kept, in order. */
  maxRows: number;
}

/** The client record's limits (customers.service). */
export const CUSTOMER_DETAIL_LIMITS: LabelValueLimits = { labelMax: 80, valueMax: 2000, maxRows: 30 };
/** An address / apartment's limits (portal.service). */
export const UNIT_DETAIL_LIMITS: LabelValueLimits = { labelMax: 80, valueMax: 500, maxRows: 40 };

/**
 * Keep only well-formed rows: both fields strings, trimmed, capped, a non-empty
 * label. `undefined` when the input is not a list at all, so a write can tell
 * "leave it alone" from "clear it".
 */
export function sanitizeLabelValueRows(details: unknown, limits: LabelValueLimits): LabelValueRow[] | undefined {
  if (!Array.isArray(details)) return undefined;
  return details
    .filter((d): d is LabelValueRow => !!d && typeof d.label === 'string' && typeof d.value === 'string')
    .map((d) => ({ label: d.label.trim().slice(0, limits.labelMax), value: d.value.trim().slice(0, limits.valueMax) }))
    .filter((d) => d.label.length > 0)
    .slice(0, limits.maxRows);
}
