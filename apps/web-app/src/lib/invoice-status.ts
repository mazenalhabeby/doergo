/**
 * Which invoice statuses belong on a customer's copy — the rule, not the drawing.
 *
 * Separated so it can be tested without rendering a PDF, and because this is a
 * decision about what a customer is told rather than about typography.
 *
 * Three states earn a mark and the rest earn silence:
 *
 *   DRAFT     not an invoice yet. Nobody should pay it or file it.
 *   CANCELED  was an invoice, is not owed.
 *   PAID      conventional, and useful to whoever opens the file later.
 *
 * ISSUED, SENT, OVERDUE and REFUNDED are deliberately absent. Beyond telling
 * the reader little — "SENT" is news to nobody holding the thing — they go
 * STALE. A PDF is a frozen copy that outlives the state it was made in, so one
 * stamped OVERDUE still says so a year after it was settled. A status that
 * changes must not be baked into a file.
 *
 * ⚠️ ISSUED IS THE WHOLE POINT OF THE STATE. A draft is watermarked so nobody
 * pays or files it, which meant the only way to get a clean PDF was to record a
 * delivery that had not happened. An issued invoice is a real invoice, so it
 * carries no mark — that is what "issued" MEANS here.
 *
 * The WORD is not decided here: the stamp is written in the client's language
 * (`INVOICE_DOCUMENT_LABELS[locale].stamp[kind]`), so this names the kind.
 * A settled invoice's kind is `settled` — the product never prints "paid".
 */
export type InvoiceStampKind = "draft" | "canceled" | "settled"

export function invoiceStamp(
  status: string,
): { kind: InvoiceStampKind; color: { r: number; g: number; b: number } } | null {
  const RED = { r: 190, g: 60, b: 52 };
  const GREEN = { r: 21, g: 112, b: 85 };

  switch ((status || "").trim().toUpperCase()) {
    case "DRAFT":
      return { kind: "draft", color: RED };
    // Both spellings: the enum is CANCELED, and the other is easy to pass in.
    case "CANCELED":
    case "CANCELLED":
      return { kind: "canceled", color: RED };
    case "PAID":
      return { kind: "settled", color: GREEN };
    // Named rather than left to the default, so nobody later "fixes" the gap
    // by stamping it. See above: a clean document is the point of the state.
    case "ISSUED":
      return null;
    default:
      return null;
  }
}
