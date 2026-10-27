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
