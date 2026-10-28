import { APPROVAL_KINDS, WAITS_FOR_YOU_FILTER, type ApprovalItem } from "@hbcfield/shared/client"
import type { Filter } from "./approval-keys"

/** The link's `?kind=` as a filter: a kind, or only what waits for the reader. Anything else is none. */
export function filterFromQuery(kind: string | null): Filter | null {
  if (!kind) return null
  // "yours" was this filter's name in links already sent.
  if (kind === WAITS_FOR_YOU_FILTER || kind === "yours") return WAITS_FOR_YOU_FILTER
  return (APPROVAL_KINDS as readonly string[]).includes(kind) ? (kind as Filter) : null
}

/**
 * The filter once the list changed: the last item waiting for the reader decided, the entry leaves the rail and
 * the list goes back to everything. Kept while the list is not read yet.
 */
export function filterAfterRead(filter: Filter, items: Pick<ApprovalItem, "step">[] | undefined): Filter {
  if (filter !== WAITS_FOR_YOU_FILTER || !items) return filter
  return items.some((i) => i.step?.waitsForYou) ? filter : "all"
}
