import { RULE_LIMITS, rulesThatApply, type ApprovalRuleView, type RuleFacts, type RuleKind } from './approval-rules';

/** How far back the rules page looks. */
export const RULE_INSIGHT_DAYS = 90;

/** A rule worth adding, read from what actually happened. */
export interface RuleSuggestion {
  kind: RuleKind;
  /** Null = every workspace. */
  spaceId: string | null;
  /** In the kind's stored unit (minutes / days / cents). */
  limit: number;
  /** Items over that limit in the window that no rule caught — one person decided each alone. */
  count: number;
}

/** What the rules of ONE kind did over the window — the numbers the rules page shows. */
export interface RuleInsights {
  kind: RuleKind;
  days: number;
  /** Items raised in the window. */
  total: number;
  /** Items each rule applies to — every rule that fits counts (the server's own reading, `rulesThatApply`). */
  perRule: Record<string, number>;
  /** Items no rule took: decided by one person. */
  uncovered: number;
  /** The limit where about one item in ten would need a second person (null: too few items to say). */
  suggestedLimit: number | null;
  suggestions: RuleSuggestion[];
}

/** The fact a kind's limit is about, in its stored unit (null: the kind has no number). */
export function ruleFactValue(kind: RuleKind, facts: RuleFacts): number | null {
  const spec = RULE_LIMITS[kind];
  return spec ? (facts[spec.fact] ?? null) : null;
}

const MIN_ITEMS = 8;
const MIN_SUGGEST = 2;

/** One rounded step per unit, so a suggestion reads like something a person would type. */
function roundLimit(kind: RuleKind, v: number): number {
  const fact = RULE_LIMITS[kind]?.fact;
  if (fact === 'minutes') return Math.max(30, Math.round(v / 30) * 30);
  if (fact === 'days') return Math.max(1, Math.round(v));
  const step = v >= 100_000 ? 10_000 : v >= 10_000 ? 5_000 : 1_000;
  return Math.max(step, Math.round(v / step) * step);
}

/**
 * What the rules of one kind would have done to the items of the window, and what is worth adding:
 * the big items (over the 90th percentile) that no rule caught — everywhere, and in the one workspace
 * where most of them happened. Pure: the reader supplies the items, this only counts.
 */
export function ruleInsights(
  kind: RuleKind,
  rules: readonly ApprovalRuleView[],
  items: readonly { facts: RuleFacts }[],
  days = RULE_INSIGHT_DAYS,
): RuleInsights {
  const live = rules.filter((r) => r.kind === kind && r.isActive);
  const perRule: Record<string, number> = {};
  const applying = items.map((i) => rulesThatApply(live, i.facts));
  for (const rs of applying) for (const r of rs) perRule[r.id] = (perRule[r.id] ?? 0) + 1;
  const caught = applying.map((rs) => rs.length > 0);

  const values = items
    .map((i) => ruleFactValue(kind, i.facts))
    .filter((v): v is number => v != null && v > 0)
    .sort((a, b) => a - b);
  const suggestedLimit =
    values.length >= MIN_ITEMS ? roundLimit(kind, values[Math.floor(values.length * 0.9) - 1] ?? 0) : null;

  const suggestions: RuleSuggestion[] = [];
  if (suggestedLimit != null) {
    const bigAlone = items.filter((i, n) => !caught[n] && (ruleFactValue(kind, i.facts) ?? 0) > suggestedLimit);
    if (bigAlone.length >= MIN_SUGGEST) {
      suggestions.push({ kind, spaceId: null, limit: suggestedLimit, count: bigAlone.length });
      const bySpace = new Map<string, number>();
      for (const i of bigAlone) for (const s of i.facts.spaceIds) bySpace.set(s, (bySpace.get(s) ?? 0) + 1);
      const [top] = [...bySpace].sort((a, b) => b[1] - a[1]);
      if (top && top[1] >= MIN_SUGGEST && top[1] < bigAlone.length)
        suggestions.push({ kind, spaceId: top[0], limit: suggestedLimit, count: top[1] });
    }
  }
  return {
    kind,
    days,
    total: items.length,
    perRule,
    uncovered: caught.filter((c) => !c).length,
    suggestedLimit,
    suggestions,
  };
}
