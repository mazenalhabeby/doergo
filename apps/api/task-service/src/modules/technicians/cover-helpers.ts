import { toISODateString } from '@hbcfield/shared';

/**
 * Everything the product knows about whether there will be enough people.
 *
 * Its own service rather than more methods on TechniciansService, because it
 * answers ONE question — cover — for callers that otherwise have nothing to do
 * with each other: the leave list wants a verdict per request, the floor panel
 * wants the present tense, and a member asking for days wants a warning. Keeping
 * them together is what stops three slightly different answers appearing on
 * three screens.
 *
 * The RULES are not here. They are pure functions in @hbcfield/shared, so the
 * web and the phone can label what this returns without re-deriving it. This
 * class does the part a pure function cannot: fetch the roster and the leave, in
 * a bounded number of queries, whatever the size of the question.
 */
/** A rota row → the shape the rules read. Shared with the calendar's person layer. */
export function shiftRuleOf(r: {
  recurrence: string; daysOfWeek: number[]; daysOfMonth: number[]; dates: Date[]; effectiveFrom: Date; effectiveTo: Date | null;
}) {
  return {
    recurrence: r.recurrence as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONE_OFF',
    daysOfWeek: r.daysOfWeek,
    daysOfMonth: r.daysOfMonth,
    dates: r.dates.map(toISODateString),
    effectiveFrom: toISODateString(r.effectiveFrom),
    effectiveTo: r.effectiveTo ? toISODateString(r.effectiveTo) : null,
  };
}
