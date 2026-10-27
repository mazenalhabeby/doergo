import { ruleLimitOf, type ApprovalRuleView } from "@hbcfield/shared/client"

/**
 * What a rule covers next to the others — the server's reading (`rulesThatApply` in shared approval-rules.ts):
 * EVERY rule that fits an item applies, and the item needs every approver they name. So a rule covers its
 * whole range on its own, and the page says which other rules apply to some of the same items.
 */
export interface RuleRange {
  /** Exclusive lower limit in stored units (minutes / days / cents); null = from nothing. */
  from: number | null
  /** Other active rules (1-based numbers) that apply to some of the same items: their approvers are needed too. */
  alsoWith: number[]
  /** An earlier rule asks the same people for the same items: this one adds nothing (that rule's 1-based number). */
  shadowedBy: number | null
}

/** Two rules can meet on one item: the same workspace, or one of them everywhere; one asset kind each, if any. */
const overlap = (a: ApprovalRuleView, b: ApprovalRuleView) =>
  (!a.spaceId || !b.spaceId || a.spaceId === b.spaceId) &&
  (!a.categoryId || !b.categoryId || a.categoryId === b.categoryId)

/** The same rule twice: same place, limit and conditions, and the same approver. */
const twins = (a: ApprovalRuleView, b: ApprovalRuleView) =>
  a.spaceId === b.spaceId &&
  ruleLimitOf(a) === ruleLimitOf(b) &&
  a.whenCoverShort === b.whenCoverShort &&
  (a.categoryId ?? null) === (b.categoryId ?? null) &&
  a.urgentOnly === b.urgentOnly &&
  a.secondRoleId === b.secondRoleId

/** Ranges for the rules of ONE kind, in the order shown. */
export function ruleRanges(rules: ApprovalRuleView[]): RuleRange[] {
  return rules.map((r, i) => {
    const twin = rules.findIndex((o, j) => j < i && o.isActive && twins(o, r))
    return {
      from: ruleLimitOf(r),
      alsoWith: r.isActive
        ? rules.flatMap((o, j) =>
            j !== i && o.isActive && o.secondRoleId && overlap(o, r) && !twins(o, r) ? [j + 1] : [],
          )
        : [],
      shadowedBy: r.isActive && twin >= 0 ? twin + 1 : null,
    }
  })
}

/** What no rule catches, per workspace: all of it, or everything up to the lowest limit there. */
export interface FallThrough {
  id: string
  name: string
  /** null = every item there; else items up to this limit (stored units) get only the first approval. */
  upTo: number | null
}

/**
 * Where items get ONLY the first approval. A workspace is covered by its own rules AND the every-workspace
 * ones (the server tries them all); a rule with no limit covers everything, otherwise the lowest limit
 * leaves the items at or under it uncaught. Rules that need "people would be short", one asset kind or urgent
 * requests never cover the rest.
 */
export function fallThrough(rules: ApprovalRuleView[], workspaces: { id: string; name: string }[]): FallThrough[] {
  // A rule for one asset kind, or urgent requests only, covers just part of what arrives there: it never covers the rest.
  // Only a rule that asks somebody more takes items out of "first approval only" (reminder-only rules do not).
  const live = rules.filter((r) => r.isActive && r.secondRoleId && !r.whenCoverShort && !r.categoryId && !r.urgentOnly)
  return workspaces.flatMap<FallThrough>((w) => {
    const here = live.filter((r) => !r.spaceId || r.spaceId === w.id)
    if (!here.length) return [{ id: w.id, name: w.name, upTo: null }]
    if (here.some((r) => ruleLimitOf(r) == null)) return []
    return [{ id: w.id, name: w.name, upTo: Math.min(...here.map((r) => ruleLimitOf(r) as number)) }]
  })
}
