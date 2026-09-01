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
 * SENT, OVERDUE and REFUNDED are deliberately absent. Beyond telling the reader
 * little — "SENT" is news to nobody holding the thing — they go STALE. A PDF is
 * a frozen copy that outlives the state it was made in, so one stamped OVERDUE
 * still says so a year after it was settled. A status that changes must not be
 * baked into a file.
 */
export function invoiceStamp(
  status: string,
): { text: string; color: { r: number; g: number; b: number } } | null {
  const RED = { r: 190, g: 60, b: 52 };
  const GREEN = { r: 21, g: 112, b: 85 };

  switch ((status || "").trim().toUpperCase()) {
    case "DRAFT":
      return { text: "DRAFT", color: RED };
    // Both spellings: the enum is CANCELED, and the other is easy to pass in.
    case "CANCELED":
    case "CANCELLED":
      return { text: "CANCELED", color: RED };
    case "PAID":
      return { text: "PAID", color: GREEN };
    default:
      return null;
  }
}
