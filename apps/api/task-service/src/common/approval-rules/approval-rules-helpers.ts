
/** What a decision's approve path learns from the gate. */
export type GateVerdict =
  | { finalize: true; minutes?: number }
  | { finalize: false; roleName: string };

const RULE_MESSAGES: Record<string, string> = {
  RULE_KIND_INVALID: 'Rules exist for overtime, requests and expenses.',
  RULE_THRESHOLD_INVALID: 'The threshold is not a valid number.',
  RULE_ROLE_REQUIRED: 'Choose one of the organization\'s roles.',
  RULE_EMPTY: 'A rule needs a second approval, a reminder or an escalation.',
  RULE_HOURS_INVALID: 'Hours must be a whole number between 1 and 720.',
  RULE_ESCALATE_ROLE_REQUIRED: 'Choose who it passes to when nobody answers.',
};

export { RULE_MESSAGES };
