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
  /** Those of `earlier` the caller stands in for, or who stand in for the caller (ended stand-ins included). */
  standInOf: string[];
  /** The roles still needed, and those of them the caller holds here. */
  left: string[];
  heldLeft: string[];
}

export interface Turn {
  /** The caller already gave one of its approvals. */
  youApproved: boolean;
  /** The approval would be refused as the same person (`SECOND_STEP_SAME_PERSON`). */
  samePerson: boolean;
  /** It now waits for the caller — Approve is offered exactly when this is true (`approvalActionsFor`). */
  waitsForYou: boolean;
  /** The caller's approval finishes it. */
  youFinish: boolean;
  /** …because they are an administrator — their own decision stands as given (no earlier minimum applies). */
  adminFinishes: boolean;
}

/**
 * One rule, read by the approval (it refuses by `samePerson`, and by `!waitsForYou` as "not your role") and by every
 * screen (Approve, "Waiting for you", "Your approval finishes it"):
 *  - an active administrator finishes anything;
 *  - every role already given (the retry of a finished decision whose write failed): whoever may decide finishes it,
 *    earlier approvers included — except when every approval came from the caller (or the leader they stand in for);
 *  - otherwise nobody gives two of its approvals (a leader and their stand-in are one person), and it waits for the
 *    caller when they hold a role still needed; only the LAST role still needed can be finished by one approval.
 */
export function approvalTurn(f: TurnFacts): Turn {
  const youApproved = f.earlier.includes(f.callerId);
  if (f.admin) return { youApproved, samePerson: false, waitsForYou: true, youFinish: true, adminFinishes: true };
  const sameAsCaller = (id: string) => id === f.callerId || f.standInOf.includes(id);
  if (!f.left.length) {
    const alone = f.earlier.length > 0 && f.earlier.every(sameAsCaller);
    return { youApproved, samePerson: alone, waitsForYou: !alone, youFinish: !alone, adminFinishes: false };
  }
  const samePerson = f.earlier.some(sameAsCaller);
  const waitsForYou = !samePerson && f.heldLeft.length > 0;
  return { youApproved, samePerson, waitsForYou, youFinish: waitsForYou && f.left.length === 1, adminFinishes: false };
}

/* ------------------------------------------------------------------ what the screens show, web and phone alike */

/**
 * An item half-way through office rules, as the inbox carries it (`ApprovalItem.step`) — declared ONCE here: who went
 * first, the roles still needed, the time agreed so far, who approved, and the caller's turn (`approvalTurn`).
 */
export interface ApprovalStepInfo {
  firstById: string;
  firstByName: string;
  roleName: string;
  /** The caller went first. */
  mine: boolean;
  /** The smallest time agreed so far (overtime only). */
  agreedMinutes?: number | null;
  approverCount?: number;
  approverNames?: string[];
  waitsForYou?: boolean;
  youFinish?: boolean;
  youApproved?: boolean;
  adminFinishes?: boolean;
}
type StepView = ApprovalStepInfo;
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
  if (step.youFinish) return 'youFinish';
  if (step.mine || step.youApproved) return 'youApproved';
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
export type ApprovalFilter = 'all' | typeof WAITS_FOR_YOU_FILTER | string;
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

/**
 * A link's `?kind=` as a filter, for web and phone: a kind, or only what waits for the reader ("yours" was its name in
 * links already sent). Anything else is none.
 */
export function filterFromQuery(kind: string | null | undefined, kinds: readonly string[]): ApprovalFilter | null {
  if (!kind) return null;
  if (kind === WAITS_FOR_YOU_FILTER || kind === 'yours') return WAITS_FOR_YOU_FILTER;
  return kinds.includes(kind) ? kind : null;
}

/** The filter once the list changed: nothing waits for the reader any more → back to everything (kept while unread). */
export function filterAfterRead(filter: ApprovalFilter, items: Pick<ItemView, 'step'>[] | undefined): ApprovalFilter {
  if (filter !== WAITS_FOR_YOU_FILTER || !items) return filter;
  return items.some((i) => i.step?.waitsForYou) ? filter : 'all';
}

/** Does a working day show under the filter — when any of its items does. */
export function dayMatchesFilter(members: Pick<ItemView, 'kind' | 'step'>[], filter: ApprovalFilter): boolean {
  return filter === 'all' || members.some((m) => matchesApprovalFilter(m, filter));
}

/** Which of the four whole sentences the agreed line is — never two strings glued (word order differs by language). */
export type AgreedLineKey = 'agreedBy' | 'agreedByCounts' | 'agreedSoFar' | 'agreedSoFarCounts';
export function agreedLineKey(line: NonNullable<ReturnType<typeof agreedLine>>): AgreedLineKey {
  return line.who
    ? line.smallerCounts
      ? 'agreedByCounts'
      : 'agreedBy'
    : line.smallerCounts
      ? 'agreedSoFarCounts'
      : 'agreedSoFar';
}

/**
 * The step sentence's values, the same on web and phone: every approver ("Anna Müller and David Koller", joined the
 * reader's way), how many (the verb's plural — from the one count), and the roles still needed (a role nobody can
 * name any more → the reader's word for "an administrator").
 */
export function stepNoticeVars(
  step: ApprovalStepInfo,
  words: { anAdministrator: string; joinNames?: (names: string[]) => string },
): { name: string; count: number; role: string } {
  const names = (step.approverNames ?? []).filter(Boolean);
  const list = names.length ? names : [step.firstByName];
  return {
    name: words.joinNames ? words.joinNames(list) : list.join(', '),
    count: Math.max(1, step.approverCount ?? list.length),
    role: roleOrAdministrator(step.roleName, words.anAdministrator),
  };
}

/**
 * A role the server names in an answer ("waiting for HR", a refusal's `role`) — '' when nobody can be named, and
 * then only an administrator can finish it: said in the reader's language.
 */
export function roleOrAdministrator(role: string | null | undefined, anAdministrator: string): string {
  return role || anAdministrator;
}

/** Names joined the reader's way ("A, B and C" / "A, B und C") where the platform knows how; else with commas. */
export function joinNamesFor(locale: string): (names: string[]) => string {
  const ListFormat = (Intl as unknown as { ListFormat?: new (l: string, o: object) => { format(v: string[]): string } })
    .ListFormat;
  if (!ListFormat) return (names) => names.join(', ');
  try {
    const f = new ListFormat(locale, { style: 'long', type: 'conjunction' });
    return (names) => f.format(names);
  } catch {
    return (names) => names.join(', ');
  }
}
