import type { RuleFacts } from '@hbcfield/shared';

/** One item a rule could apply to, as a rule reads it. */
export interface RuleItem {
  itemId: string;
  since: Date;
  subjectId: string | null;
  subjectName: string;
  facts: RuleFacts;
}

/**
 * Which window of items to read: still WAITING since before a moment (the "nobody answers" sweep), or
 * EVERY item raised since a day, decided or not (what a rule would have touched — the rules page's numbers).
 */
export type RuleItemWindow = ({ waitingBefore: Date; since?: never } | { since: Date; waitingBefore?: never }) & {
  /** Only these workspaces' items (a workspace manager's numbers), read in the query — never cut after a cap. */
  spaceIds?: string[];
};

/** `{ field: { in: spaceIds } }` when the window is narrowed, else nothing. */
export const inSpaces = (window: RuleItemWindow, field: string) =>
  window.spaceIds ? { [field]: { in: window.spaceIds } } : {};
