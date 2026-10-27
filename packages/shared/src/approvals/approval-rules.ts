import type { ApprovalKind } from './approval-kinds';

/**
 * OFFICE RULES on approvals: past a threshold, a decision needs a SECOND
 * person — "overtime over 2 h needs the workspace manager too", "an expense
 * over €200 needs Finance". Enforced in each kind's OWN approve path (task-
 * service `ApprovalRulesService.gate`), so it holds in the inbox, on the old
 * page and on the phone alike.
 *
 *   step 1  the usual approver approves → recorded, the item stays waiting
 *   step 2  somebody holding the rule's role (not the first person) approves → done
 *   reject  anybody who may decide it, at any step — the open step is dropped
 *
 * An administrator's approval finishes at once (there is nobody above them).
 *
 * A rule may also say what happens when NOBODY ANSWERS: remind the usual
 * deciders after N hours, then pass it to the holders of another role after M
 * hours (task-service `ApprovalEscalationService`, each said once). A rule can
 * be only that — no second step at all.
 */
export const RULE_KINDS = [
  'overtime',
  'request',
  'expense',
  'hours',
  'noShow',
  'assetProposal',
  'clientRequest',
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export function isRuleKind(v: unknown): v is RuleKind {
  return typeof v === 'string' && (RULE_KINDS as readonly string[]).includes(v);
}

/** Which rule kind an inbox kind falls under (extra time IS overtime). */
export function ruleKindOf(kind: ApprovalKind): RuleKind | null {
  if (kind === 'overtime' || kind === 'extraTime') return 'overtime';
  if (kind === 'request') return 'request';
  if (kind === 'expense') return 'expense';
  if (kind === 'hours' || kind === 'noShow' || kind === 'assetProposal' || kind === 'clientRequest') return kind;
  return null;
}

/** The limit a kind's rule may set: which column holds it, which fact it is compared with, and its ceiling. */
export interface RuleLimitSpec {
  field: 'minMinutes' | 'minDays' | 'minAmountCents';
  fact: 'minutes' | 'days' | 'amountCents';
  max: number;
}

/**
 * THE table of limits — matching, choosing, checking, saving and the rules page all read it, so a kind
 * cannot be limited one way here and another way there. Null = the kind has no number to pass:
 * asset papers are told apart by their asset kind, client requests by being urgent.
 */
export const RULE_LIMITS: Record<RuleKind, RuleLimitSpec | null> = {
  overtime: { field: 'minMinutes', fact: 'minutes', max: 1440 },
  request: { field: 'minDays', fact: 'days', max: 366 },
  expense: { field: 'minAmountCents', fact: 'amountCents', max: 100_000_000 },
  // Hours changed by hand: how many minutes differ from what was clocked.
  hours: { field: 'minMinutes', fact: 'minutes', max: 1440 },
  // Didn't clock in: how many days in a row.
  noShow: { field: 'minDays', fact: 'days', max: 366 },
  assetProposal: null,
  clientRequest: null,
};

/** A rule's limit, in its kind's stored unit (null = none). */
export function ruleLimitOf(rule: Pick<ApprovalRuleView, 'kind' | 'minMinutes' | 'minDays' | 'minAmountCents'>) {
  const spec = RULE_LIMITS[rule.kind];
  return spec ? (rule[spec.field] ?? null) : null;
}

export interface ApprovalRuleView {
  id: string;
  kind: RuleKind;
  spaceId: string | null;
  spaceName?: string | null;
  minMinutes: number | null;
  minDays: number | null;
  minAmountCents: number | null;
  /** request: only when the leave would drop cover below the minimum (or miss a skill). */
  whenCoverShort: boolean;
  /** Null = no second step (the rule only reminds / escalates). */
  secondRoleId: string | null;
  secondRoleName?: string | null;
  remindAfterHours: number | null;
  escalateAfterHours: number | null;
  escalateRoleId: string | null;
  escalateRoleName?: string | null;
  /** assetProposal: only papers for this asset kind (null = any kind). */
  categoryId: string | null;
  categoryName?: string | null;
  /** clientRequest: only urgent requests. */
  urgentOnly: boolean;
  isActive: boolean;
}

export interface ApprovalRuleInput {
  kind: RuleKind;
  spaceId?: string | null;
  minMinutes?: number | null;
  minDays?: number | null;
  minAmountCents?: number | null;
  whenCoverShort?: boolean;
  secondRoleId?: string | null;
  remindAfterHours?: number | null;
  escalateAfterHours?: number | null;
  escalateRoleId?: string | null;
  categoryId?: string | null;
  urgentOnly?: boolean;
  isActive?: boolean;
}

/** What one decision is about, as a rule reads it. */
export interface RuleFacts {
  /** The item's workspace(s) — a member's leave reads every workspace they work in. */
  spaceIds: string[];
  minutes?: number | null;
  days?: number | null;
  amountCents?: number | null;
  /** request: the leave would drop cover below the minimum or miss a skill (the wallchart's verdict). */
  coverShort?: boolean | null;
  /** assetProposal: the asset kind the papers are for. */
  categoryId?: string | null;
  /** clientRequest: the request is urgent. */
  urgent?: boolean | null;
}

/** Does this rule apply? Strictly MORE than the threshold; no threshold = always. */
type RuleShape = Pick<
  ApprovalRuleView,
  'kind' | 'spaceId' | 'minMinutes' | 'minDays' | 'minAmountCents' | 'isActive'
> & { whenCoverShort?: boolean; categoryId?: string | null; urgentOnly?: boolean };

export function ruleMatches(rule: RuleShape, facts: RuleFacts): boolean {
  if (!rule.isActive) return false;
  if (rule.spaceId && !facts.spaceIds.includes(rule.spaceId)) return false;
  // Both, when both are set: "over 3 days AND short of people".
  if (rule.kind === 'request' && rule.whenCoverShort && facts.coverShort !== true) return false;
  if (rule.kind === 'assetProposal' && rule.categoryId && facts.categoryId !== rule.categoryId) return false;
  if (rule.kind === 'clientRequest' && rule.urgentOnly && facts.urgent !== true) return false;
  const spec = RULE_LIMITS[rule.kind];
  const limit = ruleLimitOf(rule);
  return !spec || limit == null || (facts[spec.fact] ?? 0) > limit;
}

/**
 * EVERY rule that applies, most particular first: a workspace's own before every-workspace, then one asset kind
 * / urgent only, then the higher threshold, then the older rule (a stable order on both ends).
 *
 * ⚠️ ALL of them apply (decided 2026-10-27): an item needs every second approver they name. A workspace's own
 * rule ADDS to the organization's, it never replaces it — otherwise anybody allowed to write rules for one
 * workspace could quietly take the organization's approver out of it ("any expense here → my lead").
 */
export function rulesThatApply<R extends RuleShape & { id?: string }>(rules: readonly R[], facts: RuleFacts): R[] {
  const threshold = (r: R) => ruleLimitOf(r) ?? -1;
  const particular = (r: R) => Number(!!r.categoryId) + Number(!!r.urgentOnly);
  return rules
    .filter((r) => ruleMatches(r, facts))
    .sort(
      (a, b) =>
        Number(!!b.spaceId) - Number(!!a.spaceId) ||
        particular(b) - particular(a) ||
        threshold(b) - threshold(a) ||
        String(a.id ?? '').localeCompare(String(b.id ?? '')),
    );
}

/**
 * The FIRST of `rulesThatApply` — the rule whose reminders and escalation an item follows when nobody answers,
 * and the one the rules page counts an item under. Who must approve is ALL of them (`requiredRoleIds`).
 */
export function pickRule<R extends RuleShape & { id?: string }>(rules: R[], facts: RuleFacts): R | null {
  return rulesThatApply(rules, facts)[0] ?? null;
}

/** The second approvers an item needs: one per role, from every rule that applies, in that order. */
export function requiredRoleIds(
  rules: readonly (RuleShape & { id?: string; secondRoleId: string | null })[],
  facts: RuleFacts,
): string[] {
  return [...new Set(rulesThatApply(rules, facts).flatMap((r) => (r.secondRoleId ? [r.secondRoleId] : [])))];
}

/** A rule as entered, checked the same on both ends. Null = fine, else the refusal code. */
export function ruleInputProblem(
  input: ApprovalRuleInput,
):
  | null
  | 'RULE_KIND_INVALID'
  | 'RULE_THRESHOLD_INVALID'
  | 'RULE_ROLE_REQUIRED'
  | 'RULE_EMPTY'
  | 'RULE_HOURS_INVALID'
  | 'RULE_ESCALATE_ROLE_REQUIRED' {
  if (!isRuleKind(input.kind)) return 'RULE_KIND_INVALID';
  const hours = (h: number | null | undefined) => h == null || (Number.isInteger(h) && h >= 1 && h <= 720);
  if (!hours(input.remindAfterHours) || !hours(input.escalateAfterHours)) return 'RULE_HOURS_INVALID';
  if (input.escalateAfterHours != null && !input.escalateRoleId) return 'RULE_ESCALATE_ROLE_REQUIRED';
  if (input.escalateRoleId && input.escalateAfterHours == null) return 'RULE_HOURS_INVALID';
  // It must DO something: a second step, a reminder, or an escalation.
  if (!input.secondRoleId && input.remindAfterHours == null && input.escalateAfterHours == null) return 'RULE_EMPTY';
  const spec = RULE_LIMITS[input.kind];
  const n = spec ? input[spec.field] : null;
  if (spec && n != null && (!Number.isInteger(n) || n < 0 || n > spec.max)) return 'RULE_THRESHOLD_INVALID';
  return null;
}

/** An item waiting for its second approval, as the inbox shows it. */
export interface ApprovalStepView {
  kind: RuleKind;
  itemId: string;
  firstById: string;
  firstByName: string;
  roleName: string;
}

export type NoticeStage = 'REMIND' | 'ESCALATE';

/**
 * What is due for a waiting item under a rule, now: the escalation once its
 * hours have passed, else the reminder once its hours have passed. `sent` =
 * what was already said for this item (each is said once).
 */
export function noticeDue(
  rule: Pick<ApprovalRuleView, 'remindAfterHours' | 'escalateAfterHours' | 'escalateRoleId'>,
  waitingSince: Date,
  now: Date,
  sent: ReadonlySet<NoticeStage>,
): NoticeStage | null {
  const hours = (now.getTime() - waitingSince.getTime()) / 3_600_000;
  if (
    rule.escalateAfterHours != null &&
    rule.escalateRoleId &&
    hours >= rule.escalateAfterHours &&
    !sent.has('ESCALATE')
  )
    return 'ESCALATE';
  if (rule.remindAfterHours != null && hours >= rule.remindAfterHours && !sent.has('REMIND') && !sent.has('ESCALATE'))
    return 'REMIND';
  return null;
}
