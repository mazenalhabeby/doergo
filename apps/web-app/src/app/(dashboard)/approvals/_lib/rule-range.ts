import type { ApprovalRuleView } from "@hbcfield/shared/client"

/**
 * What a rule REALLY covers once the others are taken into account — the same choice the server makes
 * (`pickRule` in shared approval-rules.ts): of the rules that fit, a workspace's own beats every-workspace,
 * then the higher limit wins, so a rule stops where a higher limit in the same place starts.
 */
export interface RuleRange {
  /** Exclusive lower limit in stored units (minutes / days / cents); null = from nothing. */
  from: number | null
  /** Where a higher limit in the same place takes over; null = no end. */
  to: number | null
  /** Every-workspace rule: the workspaces whose own rules replace it. */
  notIn: string[]
  /** An earlier rule has the same place and limit: only one of the two is ever used (that rule's 1-based number). */
  shadowedBy: number | null
}

const limitOf = (r: ApprovalRuleView) => r.minMinutes ?? r.minDays ?? r.minAmountCents ?? null

/** Ranges for the rules of ONE kind, in the order shown. */
export function ruleRanges(rules: ApprovalRuleView[], spaceName: (id: string) => string): RuleRange[] {
  const live = rules.filter((r) => r.isActive)
  return rules.map((r) => {
    const from = limitOf(r)
    const same = live.filter((o) => o.id !== r.id && o.spaceId === r.spaceId)
    // A rule that only applies when people would be short never takes the plain range away.
    const higher = same
      .filter((o) => !o.whenCoverShort && (limitOf(o) ?? -1) > (from ?? -1))
      .map((o) => limitOf(o) as number)
    const twin = rules.findIndex(
      (o) =>
        o.id !== r.id &&
        o.isActive &&
        o.spaceId === r.spaceId &&
        limitOf(o) === from &&
        o.whenCoverShort === r.whenCoverShort,
    )
    const notIn = r.spaceId
      ? []
      : [...new Set(live.filter((o) => o.spaceId).map((o) => o.spaceId as string))].map(spaceName)
    return {
      from,
      to: higher.length ? Math.min(...higher) : null,
      notIn,
      shadowedBy: twin >= 0 && twin < rules.indexOf(r) ? twin + 1 : null,
    }
  })
}

/** What no rule catches, per workspace: all of it, or everything up to the lowest limit there. */
export interface FallThrough {
  name: string
  /** null = every item there; else items up to this limit (stored units) get only the first approval. */
  upTo: number | null
}

/**
 * Where items get ONLY the first approval. A workspace is covered by its own rules AND the every-workspace
 * ones (the server tries them all); a rule with no limit covers everything, otherwise the lowest limit
 * leaves the items at or under it uncaught. Rules that need "people would be short" never cover the rest.
 */
export function fallThrough(rules: ApprovalRuleView[], workspaces: { id: string; name: string }[]): FallThrough[] {
  const live = rules.filter((r) => r.isActive && !r.whenCoverShort)
  return workspaces.flatMap<FallThrough>((w) => {
    const here = live.filter((r) => !r.spaceId || r.spaceId === w.id)
    if (!here.length) return [{ name: w.name, upTo: null }]
    if (here.some((r) => limitOf(r) == null)) return []
    return [{ name: w.name, upTo: Math.min(...here.map((r) => limitOf(r) as number)) }]
  })
}
