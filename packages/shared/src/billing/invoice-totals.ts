/**
 * An invoice's money — ONE calculation for the draft screen and the server.
 *
 * ⚠️ The rule: every line is rounded to the cent ON ITS OWN, the subtotal is the
 * sum of those rounded lines, VAT is charged on the subtotal (rounded once), and
 * the total is subtotal + VAT − discount. A client checking the invoice adds up
 * the line amounts they can SEE — so the subtotal must be the sum of exactly
 * those numbers. The screen once summed rounded lines while the server summed
 * unrounded ones, and a saved invoice came out a cent short of its own draft.
 *
 * Everything is done in integer cents; the major-unit numbers are derived last.
 */

/**
 * A cent amount rounded half away from zero, after shaving float noise.
 *
 * ⚠️ `toFixed(6)` first: 1.33 h × €45.75 is 6084.749999… in binary, which is
 * 6084.75 to every human reading it and must round UP like 6084.75 would.
 */
export function roundCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  const clean = Number(Math.abs(cents).toFixed(6));
  return Math.sign(cents) * Math.round(clean) || 0;
}

/** One line's amount in cents: quantity × unit price, rounded to the cent. */
export function lineAmountCents(quantity: number, unitPrice: number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  return roundCents(q * p * 100);
}

/** One line's amount in the invoice's currency (major units), rounded to the cent. */
export function lineAmount(quantity: number, unitPrice: number): number {
  return lineAmountCents(quantity, unitPrice) / 100;
}

export interface InvoiceTotals {
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  /** The same, in major units — what the Invoice columns hold. */
  subtotal: number;
  taxAmount: number;
  total: number;
}

/**
 * Subtotal (cents) → VAT, total. `taxRate` is a FRACTION (0.2 for 20 %),
 * `discount` an amount in major units, as the Invoice columns hold them.
 */
export function invoiceTotalsFromSubtotalCents(
  subtotalCents: number,
  taxRate?: number | null,
  discount?: number | null,
): InvoiceTotals {
  const rate = Number.isFinite(taxRate as number) ? (taxRate as number) : 0;
  const sub = roundCents(subtotalCents);
  const taxCents = roundCents(sub * rate);
  const discountCents = roundCents((Number.isFinite(discount as number) ? (discount as number) : 0) * 100);
  const totalCents = sub + taxCents - discountCents;
  return {
    subtotalCents: sub,
    taxCents,
    discountCents,
    totalCents,
    subtotal: sub / 100,
    taxAmount: taxCents / 100,
    total: totalCents / 100,
  };
}

/** Lines → subtotal, VAT, total, by the rule above. */
export function invoiceTotals(
  lines: ReadonlyArray<{ quantity: number; unitPrice: number }>,
  taxRate?: number | null,
  discount?: number | null,
): InvoiceTotals {
  const subtotalCents = lines.reduce((sum, l) => sum + lineAmountCents(l.quantity, l.unitPrice), 0);
  return invoiceTotalsFromSubtotalCents(subtotalCents, taxRate, discount);
}

/**
 * A stored subtotal (major units, possibly an old unrounded sum) → totals.
 * Used where only the invoice row is at hand (a tax or discount change).
 */
export function invoiceTotalsFromSubtotal(
  subtotal: number,
  taxRate?: number | null,
  discount?: number | null,
): InvoiceTotals {
  return invoiceTotalsFromSubtotalCents(roundCents((Number.isFinite(subtotal) ? subtotal : 0) * 100), taxRate, discount);
}
