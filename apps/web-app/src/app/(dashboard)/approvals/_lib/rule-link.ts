import { ruleKindOf, type ApprovalItem, type RuleKind } from "@hbcfield/shared/client"

/** The link to the rules page offering one rule: `/approvals?tab=rules&kind=…&space=…&limit=…`. */
export function ruleLinkFor(kind: RuleKind, spaceId: string | null, limit: number | null): string {
  const q = new URLSearchParams({ tab: "rules", kind })
  if (spaceId) q.set("space", spaceId)
  if (limit != null) q.set("limit", String(limit))
  return `/approvals?${q}`
}

/** A limit just under the item's own value, rounded the way a person would type it — so the rule catches it. */
function limitUnder(kind: RuleKind, v: number): number {
  const step = kind === "overtime" ? 30 : kind === "expense" ? 1_000 : 1
  return Math.max(0, Math.floor((v - 1) / step) * step)
}

/**
 * "Make a rule like this" for an inbox item: its rule kind, its workspace, and a limit that would have
 * caught it. Null for a kind rules do not apply to.
 */
export function ruleLinkForItem(item: ApprovalItem): string | null {
  const kind = ruleKindOf(item.kind)
  if (!kind) return null
  const d = item.data as Record<string, unknown>
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null)
  // The fact the kind's limit is about, as the inbox item carries it (none for a kind with no limit).
  const value =
    kind === "overtime"
      ? (num("requestedMinutes") ?? num("pastEndMinutes"))
      : kind === "request"
        ? num("workingDays")
        : kind === "noShow"
          ? num("runCount")
          : kind === "expense"
            ? num("amountCents")
            : null
  return ruleLinkFor(kind, item.space?.id ?? null, value != null && value > 0 ? limitUnder(kind, value) : null)
}
