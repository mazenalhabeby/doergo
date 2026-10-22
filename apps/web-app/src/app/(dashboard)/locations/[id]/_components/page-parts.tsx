"use client"

/** Parts moved here unchanged from page.tsx (line length pass). */
/**
 * Tabs that are no longer here, and where their screen lives now.
 *
 * Kept as data rather than three ifs so adding or reversing a move is one line,
 * and so the redirect and the removal cannot disagree about which tabs moved.
 */
export const MOVED_TABS: Record<string, string> = {
  customers: "/clients",
  assets: "/assets",
  portal: "/portals",
  /*
    ⚠️ Invoices was left behind when the other three moved, on the grounds that
    "per-space billing IS a setting". That is true of the MODULE and was never
    true of the invoices: reaching one meant Spaces → a workspace → Configure →
    Invoices, and the same four steps again for the next workspace. The list at
    /invoices asks which workspace the way every other content screen does.
  */
  invoices: "/invoices",
}
