/**
 * Whose turn an item half-way through office rules is — ONE rule for the approval itself (the gate refuses the
 * same person twice and a leader with the stand-in deciding with their authority) and for what the screens show
 * ("Waiting for you", "Your approval finishes it"), so a screen never promises what the approval then refuses.
 * Pure: the caller's roles and stand-ins are read by the server and passed in.
 */

export interface TurnFacts {
  callerId: string;
  /** An ACTIVE administrator: finishes anything at once. */
  admin: boolean;
  /** Everyone who has approved it so far — the first approver included (steps from before the list had only them). */
  earlier: string[];
  /** The caller is a stand-in of one of `earlier`, or one of them stands in for the caller (ended ones included). */
  standInOfEarlier: boolean;
  /** The roles still needed, and those of them the caller holds here. */
  left: string[];
  heldLeft: string[];
}

export interface Turn {
  /** The caller already gave one of its approvals. */
  youApproved: boolean;
  /** The approval would be refused as the same person (`SECOND_STEP_SAME_PERSON`). */
  samePerson: boolean;
  /** It now waits for the caller: they may give a role still needed. */
  waitsForYou: boolean;
  /** The caller's approval finishes it. */
  youFinish: boolean;
  /** …because they are an administrator — their own decision stands as given (no earlier minimum applies). */
  adminFinishes: boolean;
}

export function approvalTurn(f: TurnFacts): Turn {
  const youApproved = f.earlier.includes(f.callerId);
  if (f.admin) return { youApproved, samePerson: false, waitsForYou: true, youFinish: true, adminFinishes: true };
  const samePerson = f.left.length > 0 && (youApproved || f.standInOfEarlier);
  const waitsForYou = !samePerson && f.heldLeft.length > 0;
  // Each role is given by a different person: only the LAST role still needed can be finished by one approval.
  const youFinish = waitsForYou && f.left.length === 1;
  return { youApproved, samePerson, waitsForYou, youFinish, adminFinishes: false };
}

/* ------------------------------------------------------------------ what the screens show, web and phone alike */

type StepView = {
  firstByName: string;
  mine: boolean;
  agreedMinutes?: number | null;
  waitsForYou?: boolean;
  youFinish?: boolean;
  youApproved?: boolean;
  adminFinishes?: boolean;
  approverCount?: number;
  approverNames?: string[];
};
type ItemView = { kind: string; data: Record<string, unknown>; step?: StepView };

/** Where a decision's time starts when nothing was agreed or asked. */
export const DEFAULT_DECISION_MINUTES = 30;

/**
 * Where the time field starts: the time already agreed (the smallest counts, so a default would let the next person
 * cut it without noticing), else what was asked, else 30 min. An agreed 0 is no agreed time.
 */
export function initialDecisionMinutes(item: Pick<ItemView, 'data' | 'step'>): number {
  const agreed = item.step?.agreedMinutes;
  if (typeof agreed === 'number' && agreed > 0) return agreed;
  const requested = item.data.requestedMinutes;
  return typeof requested === 'number' && requested > 0 ? requested : DEFAULT_DECISION_MINUTES;
}

/**
 * The line above the time field: who agreed what so far. Named only when ONE person agreed (with several, the
 * smallest may be anybody's); "a smaller time counts instead" only when it does — never for an administrator,
 * whose decision stands as given. None for the caller's own approval or when nothing was agreed.
 */
export function agreedLine(
  step: StepView | undefined,
): { minutes: number; who: string | null; smallerCounts: boolean } | null {
  const minutes = step?.agreedMinutes;
  if (!step || typeof minutes !== 'number' || minutes <= 0 || step.youApproved || step.mine) return null;
  return {
    minutes,
    who: (step.approverCount ?? 1) === 1 ? step.firstByName : null,
    smallerCounts: !step.adminFinishes,
  };
}

/** Which sentence explains a half-way item to the caller — one choice for web and phone (`approvals.step.<kind>`). */
export type StepNoticeKind = 'youApproved' | 'youFinish' | 'youCanGive' | 'waiting';
export function stepNoticeKind(step: StepView): StepNoticeKind {
  if (step.mine || step.youApproved) return 'youApproved';
  if (step.youFinish) return 'youFinish';
  if (step.waitsForYou) return 'youCanGive';
  return 'waiting';
}

/** The small marks on an item, in the order they are shown. */
export type ApprovalTag = 'waitsForYou' | 'datesPassed';
export function approvalTags(item: Pick<ItemView, 'data' | 'step'>): ApprovalTag[] {
  const tags: ApprovalTag[] = [];
  if (item.step?.waitsForYou) tags.push('waitsForYou');
  if (item.data.datesPassed === true) tags.push('datesPassed');
  return tags;
}

/** The list's filter: everything, only what waits for the caller, or one kind. */
export const WAITS_FOR_YOU_FILTER = 'waitsForYou';
export function matchesApprovalFilter(item: Pick<ItemView, 'kind' | 'step'>, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === WAITS_FOR_YOU_FILTER) return !!item.step?.waitsForYou;
  return item.kind === filter;
}

/** Who has approved so far, as one name list ("Anna Müller, David Koller") — never just the first of several. */
export function approvedByNames(step: Pick<StepView, 'firstByName' | 'approverNames'>): string {
  const names = (step.approverNames ?? []).filter(Boolean);
  return names.length ? names.join(', ') : step.firstByName;
}
