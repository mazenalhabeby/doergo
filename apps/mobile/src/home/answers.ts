import { useMemo } from 'react';

/**
 * What each widget would SAY right now, and whether it has an answer yet.
 *
 * ⚠️ ONE HOOK, CALLED ONCE, FOR EVERY WIDGET — AND THAT IS NOT A STYLE CHOICE.
 *
 * The obvious shape is a `useAnswer()` on each registry row, which reads
 * beautifully and is illegal: rows are filtered by entitlement and by what is
 * already on the home, so the set changes between renders, and a hook called
 * from a filtered list is a hook called conditionally. `rules-of-hooks.spec.ts`
 * exists in this repo because that mistake has been made here before.
 *
 * So every context is read HERE, unconditionally, in one place, and the result
 * is plain data keyed by widget. The screen looks a widget up; it never knows
 * which context feeds which key, and the registry stays pure data.
 *
 * ⚠️ AND NOTHING IN HERE MAY FETCH. Every value comes from something the app
 * has already loaded for its own reasons. The home screen asks this question
 * about widgets that are NOT on the member's home — the two suggestions on the
 * empty home, and every page of the gallery — so a value that cost a request
 * would mean opening the gallery fires one round trip per widget the member
 * does not have.
 */
export interface WidgetAnswer {
  /**
   * Has this widget's answer arrived?
   *
   * ⚠️ NOT "is it non-zero". `home-screen.md` §1 and §4 both refuse to offer a
   * widget that would render "loading", and a count of zero is also what a
   * member with nothing outstanding looks like. Offering somebody a card
   * because it is still loading, and refusing them one because they are up to
   * date, are two different mistakes with the same symptom.
   *
   * A widget that cannot answer the question — because nothing on screen knows
   * — is `ready: true` with a `line` of `null`. It can be OFFERED (there is no
   * evidence against it) but it cannot be SUGGESTED (§1's pill needs a line).
   */
  ready: boolean;
  /** That widget's own live answer, in one line. `null` until it has one. */
  line: string | null;
}

export type WidgetAnswers = Readonly<Record<string, WidgetAnswer>>;

/** A widget nothing on screen can speak for. Offered, never suggested. */
export const NO_ANSWER: WidgetAnswer = { ready: true, line: null };

/**
 * ⚠️ EVERY CONTEXT THIS READS GOES AT THE TOP, UNCONDITIONALLY.
 *
 * Empty while the registry is: a widget's answer is written when the widget
 * is, and an entry for a key that has no row would be a sentence about a card
 * nobody can see.
 */
export function useWidgetAnswers(): WidgetAnswers {
  return useMemo<WidgetAnswers>(() => ({}), []);
}

/** The answer for one widget, with the honest default for one nobody speaks for. */
export function answerFor(answers: WidgetAnswers, key: string): WidgetAnswer {
  return answers[key] ?? NO_ANSWER;
}
