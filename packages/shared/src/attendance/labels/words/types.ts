import type { ClosedHow, LabelCode, PositionFact } from '../contract';
import type { ApprovalWord } from '../catalogue';

/** Explanation sentences — `{{name}}` placeholders are filled by explain.ts. */
export interface ExplainWords {
  late: string;
  lateNoName: string;
  lateFromRest: string;
  earlyDeparture: string;
  overtime: string;
  pastDailyLimit: string;
  unscheduled: string;
  closed: Record<ClosedHow, string>;
  outside: string;
  outsideWithAccuracy: string;
  notJudged: Record<NonNullable<PositionFact['notJudgedBecause']>, string>;
  boundaryChanged: string;
}

/** Everything a reader sees about attendance labels, in one language. */
export interface LabelWords {
  label: Record<LabelCode, string>;
  approval: Record<ApprovalWord, string>;
  explain: ExplainWords;
}
