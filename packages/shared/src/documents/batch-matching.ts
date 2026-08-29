/**
 * Matching a pile of files to the people they belong to.
 *
 * Payroll produces thirty PDFs on the 25th named things like
 * `2026-08_holub_monika.pdf`. Nobody is going to pick a member from a dropdown
 * thirty times, so the filenames are read — but a guess about whose payslip
 * this is has to be visibly a guess, because being wrong once is not something
 * you can take back.
 *
 * Hence three outcomes, not two: EXACT (both names present), FUZZY (surname and
 * an initial — offered, but flagged), and UNMATCHED. The caller refuses to
 * publish while anything is unmatched.
 *
 * Pure. No I/O, no clock.
 */

export type MatchConfidence = 'EXACT' | 'FUZZY' | 'UNMATCHED';

export interface MatchCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface FileMatch {
  fileName: string;
  /** The member this file appears to belong to, if any. */
  userId: string | null;
  confidence: MatchConfidence;
  /** Period read from the filename, when it carries one. */
  periodYear: number | null;
  periodMonth: number | null;
  /** Why it matched, for the review screen. */
  reason: string;
}

/**
 * Fold a string to comparable tokens.
 *
 * Diacritics are stripped because a payroll export writes "mueller" where the
 * member record says "Müller" at least as often as the reverse, and a batch
 * that silently failed to match every umlaut surname would be worse than one
 * that failed loudly.
 */
export function tokenize(input: string): string[] {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/gi, 'ss')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Drop a trailing extension without touching dots inside the name. */
export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{1,5}$/i, '');
}

/**
 * A year and month read from a filename, if one is unambiguously there.
 *
 * Accepts `2026-08`, `2026_08`, `202608`, and `08-2026`. Deliberately narrow:
 * a wrong period silently files August's payslip under June, and the member
 * never notices because the row still says "Payslip".
 */
export function readPeriod(fileName: string): { year: number | null; month: number | null } {
  const s = stripExtension(fileName);

  // year-first: 2026-08 / 2026_08 / 202608
  const yFirst = s.match(/(?<!\d)(20\d{2})[-_.]?(0[1-9]|1[0-2])(?!\d)/);
  if (yFirst) return { year: Number(yFirst[1]), month: Number(yFirst[2]) };

  // month-first: 08-2026 / 08_2026
  const mFirst = s.match(/(?<!\d)(0[1-9]|1[0-2])[-_.](20\d{2})(?!\d)/);
  if (mFirst) return { year: Number(mFirst[2]), month: Number(mFirst[1]) };

  // A bare year, for annual documents.
  const yOnly = s.match(/(?<!\d)(20\d{2})(?!\d)/);
  if (yOnly) return { year: Number(yOnly[1]), month: null };

  return { year: null, month: null };
}

/**
 * Match one filename against the members of an organization.
 *
 * An EXACT match needs BOTH names present. A surname alone is FUZZY even when
 * it is unique today, because "Weber" being the only Weber is a fact about this
 * month's headcount, not about the data.
 */
export function matchFile(fileName: string, candidates: MatchCandidate[]): FileMatch {
  const { year, month } = readPeriod(fileName);
  const tokens = new Set(tokenize(stripExtension(fileName)));

  const base: Omit<FileMatch, 'userId' | 'confidence' | 'reason'> = {
    fileName,
    periodYear: year,
    periodMonth: month,
  };

  // An email in the filename is unambiguous and beats every name heuristic.
  const byEmail = candidates.filter((c) => {
    const local = c.email.split('@')[0];
    return !!local && tokens.has(local.toLowerCase());
  });
  if (byEmail.length === 1) {
    return { ...base, userId: byEmail[0]!.id, confidence: 'EXACT', reason: 'email' };
  }

  const exact = candidates.filter((c) => {
    const first = tokenize(c.firstName);
    const last = tokenize(c.lastName);
    return (
      first.length > 0 &&
      last.length > 0 &&
      first.every((t) => tokens.has(t)) &&
      last.every((t) => tokens.has(t))
    );
  });
  if (exact.length === 1) {
    return { ...base, userId: exact[0]!.id, confidence: 'EXACT', reason: 'first and last name' };
  }
  if (exact.length > 1) {
    // Two people with the same name is exactly when a confident guess is worst.
    return { ...base, userId: null, confidence: 'UNMATCHED', reason: 'more than one member matches' };
  }

  const fuzzy = candidates.filter((c) => {
    const last = tokenize(c.lastName);
    if (last.length === 0 || !last.every((t) => tokens.has(t))) return false;
    const initial = c.firstName.trim().charAt(0).toLowerCase();
    return !initial || [...tokens].some((t) => t.startsWith(initial));
  });
  if (fuzzy.length === 1) {
    return { ...base, userId: fuzzy[0]!.id, confidence: 'FUZZY', reason: 'surname and initial' };
  }

  return {
    ...base,
    userId: null,
    confidence: 'UNMATCHED',
    reason: fuzzy.length > 1 ? 'more than one member matches' : 'no member matches this name',
  };
}

/**
 * Match a whole batch, refusing to give two files to the same member.
 *
 * The duplicate check is the point. Payroll exporting `weber_m.pdf` twice, or a
 * surname shared by two people, otherwise produces two payslips filed against
 * one person — and the other person's is the one that goes missing.
 */
export function matchBatch(fileNames: string[], candidates: MatchCandidate[]): FileMatch[] {
  const matches = fileNames.map((f) => matchFile(f, candidates));

  const byUser = new Map<string, number>();
  for (const m of matches) {
    if (m.userId) byUser.set(m.userId, (byUser.get(m.userId) ?? 0) + 1);
  }

  return matches.map((m) =>
    m.userId && (byUser.get(m.userId) ?? 0) > 1
      ? { ...m, userId: null, confidence: 'UNMATCHED' as const, reason: 'two files matched this member' }
      : m,
  );
}

/** Whether a batch is safe to publish. */
export function batchIsPublishable(matches: FileMatch[]): boolean {
  // All-or-nothing, deliberately. Publishing the resolved rows and leaving the
  // rest would put SOME payslips out and hide the problem in a half-finished
  // screen; one unmatched file is a reason to stop, not to proceed carefully.
  return matches.length > 0 && matches.every((m) => m.userId !== null);
}
