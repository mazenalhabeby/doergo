import { RULE_LIMITS, ruleKindOf, type ApprovalItem, type RuleKind } from "@hbcfield/shared/client"

/**
 * The link to the rules page offering one rule: `/approvals?tab=rules&ruleKind=…&space=…&limit=…`. Its own name
 * (`ruleKind`), never `kind` — that one opens the inbox on an approval kind, and some share a name ("overtime").
 */
export function ruleLinkFor(kind: RuleKind, spaceId: string | null, limit: number | null): string {
  const q = new URLSearchParams({ tab: "rules", ruleKind: kind })
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
 * caught it. Null for a kind rules do not apply to — and for an item of a kind WITH a limit whose figure the
 * inbox does not carry (hours carry no "changed by hand" minutes): no limit there would be a rule for every
 * item of the kind, which is not "like this".
 */
export function ruleLinkForItem(item: ApprovalItem): string | null {
  const kind = ruleKindOf(item.kind)
  if (!kind) return null
  const d = item.data as Record<string, unknown>
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null)
  // Time outside the shift is before the start AND after the end: the rule is judged on all of it.
  const outside =
    num("beforeMinutes") != null || num("afterMinutes") != null
      ? (num("beforeMinutes") ?? 0) + (num("afterMinutes") ?? 0)
      : null
  // The fact the kind's limit is about, as the inbox item carries it (none for a kind with no limit).
  const value =
    item.kind === "outside"
      ? outside
      : kind === "overtime"
        ? (num("requestedMinutes") ?? num("pastEndMinutes"))
        : kind === "hours"
          ? num("handChangedMinutes")
          : kind === "request"
            ? num("workingDays")
            : kind === "noShow"
              ? num("runCount")
              : kind === "expense"
                ? num("amountCents")
                : null
  if (RULE_LIMITS[kind] && value == null) return null
  // A limit that rounds down to nothing (20 min of overtime) is no limit: the rule is offered for "every one",
  // and says so.
  const limit = value != null && value > 0 ? limitUnder(kind, value) : 0
  return ruleLinkFor(kind, item.space?.id ?? null, limit > 0 ? limit : null)
}
