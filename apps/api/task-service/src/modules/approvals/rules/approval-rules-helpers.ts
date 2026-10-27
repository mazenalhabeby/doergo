import type { RuleFacts, RuleKind } from '@hbcfield/shared';

/** One decision as the gate judges it. */
export interface RuleGateInput {
  organizationId: string;
  kind: RuleKind;
  itemId: string;
  facts: RuleFacts;
  deciderId: string;
  subjectId?: string | null;
  subjectName?: string | null;
  /**
   * Earlier ids of the SAME item: a run of missed days is keyed on its newest day, so when another day joins
   * the run the step opened on the old newest day is found — and moved — instead of being lost.
   */
  itemAliases?: string[];
  /**
   * Overtime: the minutes THIS decision agrees to, when the rule is judged on more (the shift's whole overtime,
   * earlier rounds included — so 59-minute rounds are no way round a one-hour rule). Defaults to the facts' own.
   */
  agreeMinutes?: number;
  /**
   * A batch ("Approve all"): who was already told, per role and workspace — the next approvers of each hear once
   * for the batch, and a group the batch reaches later is still told.
   */
  toldOnce?: Set<string>;
}

/** What a decision's approve path learns from the gate. */
export type GateVerdict =
  | {
      finalize: true;
      minutes?: number;
      /** The step this approval finished — `reopen` it if the write fails. */ stepId?: string;
    }
  | { finalize: false; roleName: string };

/** What `ApprovalRulesService.decide` answers: still waiting for somebody (nothing written), or the write's result. */
export type Decided<T> =
  { waiting: { stage: 'FIRST_STEP'; waitingFor: string }; done?: never } | { done: T; waiting?: never };

const RULE_MESSAGES: Record<string, string> = {
  RULE_KIND_INVALID:
    'Rules exist for overtime, requests, expenses, changed hours, missed clock-ins, asset papers and client requests.',
  RULE_THRESHOLD_INVALID: 'The threshold is not a valid number.',
  RULE_ROLE_REQUIRED: "Choose one of the organization's roles.",
  RULE_ROLE_CANNOT_DECIDE: 'Nobody holding this role may approve this kind of item — choose another role.',
  RULE_EMPTY: 'A rule needs a second approval, a reminder or an escalation.',
  RULE_HOURS_INVALID: 'Hours must be a whole number between 1 and 720.',
  RULE_ESCALATE_ROLE_REQUIRED: 'Choose who it passes to when nobody answers.',
};

export { RULE_MESSAGES };
