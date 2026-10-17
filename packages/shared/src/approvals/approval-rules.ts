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
export const RULE_KINDS = ['overtime', 'request', 'expense'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export function isRuleKind(v: unknown): v is RuleKind {
  return typeof v === 'string' && (RULE_KINDS as readonly string[]).includes(v);
}

/** Which rule kind an inbox kind falls under (extra time IS overtime). */
export function ruleKindOf(kind: ApprovalKind): RuleKind | null {
  if (kind === 'overtime' || kind === 'extraTime') return 'overtime';
  if (kind === 'request') return 'request';
  if (kind === 'expense') return 'expense';
  return null;
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
}

/** Does this rule apply? Strictly MORE than the threshold; no threshold = always. */
type RuleShape = Pick<
  ApprovalRuleView,
  'kind' | 'spaceId' | 'minMinutes' | 'minDays' | 'minAmountCents' | 'isActive'
> & { whenCoverShort?: boolean };

export function ruleMatches(rule: RuleShape, facts: RuleFacts): boolean {
  if (!rule.isActive) return false;
  if (rule.spaceId && !facts.spaceIds.includes(rule.spaceId)) return false;
  switch (rule.kind) {
    case 'overtime':
      return rule.minMinutes == null || (facts.minutes ?? 0) > rule.minMinutes;
    case 'request':
      // Both, when both are set: "over 3 days AND short of people".
      if (rule.whenCoverShort && facts.coverShort !== true) return false;
      return rule.minDays == null || (facts.days ?? 0) > rule.minDays;
    case 'expense':
      return rule.minAmountCents == null || (facts.amountCents ?? 0) > rule.minAmountCents;
  }
}

/** Of several rules that apply, the one to follow: a workspace's own before every-workspace, then the highest threshold. */
export function pickRule<R extends RuleShape>(rules: R[], facts: RuleFacts): R | null {
  const threshold = (r: R) => r.minMinutes ?? r.minDays ?? r.minAmountCents ?? -1;
  return (
    rules
      .filter((r) => ruleMatches(r, facts))
      .sort((a, b) => Number(!!b.spaceId) - Number(!!a.spaceId) || threshold(b) - threshold(a))[0] ?? null
  );
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
  const n =
    input.kind === 'overtime' ? input.minMinutes : input.kind === 'request' ? input.minDays : input.minAmountCents;
  const max = input.kind === 'overtime' ? 1440 : input.kind === 'request' ? 366 : 100_000_000;
  if (n != null && (!Number.isInteger(n) || n < 0 || n > max)) return 'RULE_THRESHOLD_INVALID';
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
