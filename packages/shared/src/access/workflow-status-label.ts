/**
 * What a status is CALLED, in the reader's language.
 *
 * A status name is tenant data: someone typed it, it lives in their database,
 * and it cannot be put in a locale file. But most names are never typed — they
 * arrive from a shipped template in English, and an organisation working in
 * German then reads "On The Way" forever inside an app that is otherwise fully
 * translated.
 *
 * The resolution is a key stored NEXT TO the name rather than a translation of
 * it. A step copied from a shipped template carries the key its name came from;
 * anything a person wrote carries none and is shown exactly as written.
 *
 * On performance, which is the reason it is shaped this way:
 *
 *   - no join and no extra query — the key travels on the row that was already
 *     being read;
 *   - no per-locale table, so a board with forty cards does not fan out into
 *     forty lookups;
 *   - resolution is a hash hit in a translation bundle the client already holds,
 *     which is the same cost as any other label on the screen.
 *
 * The alternatives were considered and are worse: a translations table costs a
 * join on the hottest read in the product; translating at fork time freezes the
 * language at the moment somebody clicked; translating at render time through a
 * service adds a network call to drawing a column header.
 */

/** The key a shipped status name is published under. */
export function workflowStatusKey(statusKey: string): string {
  return `workflowStatus.${statusKey.trim().toLowerCase()}`;
}

export interface LabelableStatus {
  name: string;
  /** Set only when the name came from a shipped template. */
  nameKey?: string | null;
}

/**
 * Resolve a status label with a translator.
 *
 * `translate` is the caller's `t` — passed in rather than imported so this stays
 * dependency-free and usable from web, mobile and any test.
 */
export function workflowStatusLabel(
  status: LabelableStatus | null | undefined,
  translate: (key: string, opts: { defaultValue: string }) => string,
): string {
  if (!status) return '';
  // No key means a person wrote this name. Translating it would be replacing
  // their word with ours, which is worse than leaving it alone.
  if (!status.nameKey) return status.name;
  return translate(status.nameKey, { defaultValue: status.name });
}
