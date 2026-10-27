import type { ApprovalItem } from "@hbcfield/shared/client"
import type { Filter } from "./approval-keys"

/**
 * Where the duration field starts. An earlier approver's agreed time comes first: starting on a default (or on what
 * was asked) would let the second person cut it without noticing — the smaller time is the one that counts.
 */
export function initialDecisionMinutes(item: Pick<ApprovalItem, "data" | "step">): number {
  const agreed = item.step?.agreedMinutes
  if (typeof agreed === "number") return agreed
  const requested = (item.data as Record<string, unknown>).requestedMinutes
  return typeof requested === "number" ? requested : 30
}

/** The sentence under a half-way item: whose turn it is, and whether the reader's approval finishes it. */
export function stepNoticeKey(step: NonNullable<ApprovalItem["step"]>): string {
  if (step.mine) return "approvals.step.mine"
  if (step.youFinish) return "approvals.step.youFinish"
  if (step.waitsForYou) return "approvals.step.waitingYou"
  return "approvals.step.waiting"
}

/** Does an item show under the rail's choice — a kind, everything, or only what waits for the reader. */
export function matchesFilter(item: Pick<ApprovalItem, "kind" | "step">, filter: Filter): boolean {
  if (filter === "all") return true
  if (filter === "yours") return !!item.step?.waitsForYou
  return item.kind === filter
}
