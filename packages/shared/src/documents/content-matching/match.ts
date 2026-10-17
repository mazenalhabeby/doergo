/** Matching a document to a member, whether it needs a scan, and merging what the device and the server read. */
import { matchFile, type FileMatch, type MatchCandidate } from '../batch-matching';
import { readEmailsFromText, readPeriodFromText, type ContentPeriod } from './read';

/**
 * Whose document this is, according to the document.
 *
 * ⚠️ Only an EXACT result counts. The filename matcher offers FUZZY — a surname
 * plus an initial — because a filename is short and deliberate. A page of text
 * is neither: "Weber" appearing somewhere in a two-page invoice says almost
 * nothing, and accepting it would file documents against people who are merely
 * mentioned. An email is the strong signal here and is tried first.
 */
export function matchTextToMember(
  text: string,
  candidates: MatchCandidate[],
): { userId: string; reason: string } | null {
  const emails = readEmailsFromText(text);
  const byEmail = candidates.filter((c) => emails.includes(c.email.trim().toLowerCase()));
  if (byEmail.length === 1) {
    return { userId: byEmail[0]!.id, reason: 'email in the document' };
  }
  if (byEmail.length > 1) return null;

  // Reuse the filename matcher's name logic rather than writing a second one —
  // it already handles diacritics, duplicate names and "more than one matches".
  const byName = matchFile(text, candidates);
  if (byName.confidence === 'EXACT' && byName.userId) {
    return { userId: byName.userId, reason: 'name in the document' };
  }
  return null;
}

/**
 * Is it worth opening this file at all?
 *
 * The performance rule, stated once so every caller obeys the same one. Reading
 * a PDF costs orders of magnitude more than reading its name — a payroll drop of
 * thirty files would be thirty parses — and most of that work is wasted, because
 * a batch named `2026-08_holub_monika.pdf` has already answered both questions
 * before the file is touched.
 *
 * So the file is opened only when the NAME left something unanswered:
 *
 *   • nobody matched, or only a surname-and-initial guess matched
 *   • the type needs a period and the name did not carry one
 *
 * A batch that is properly named therefore costs exactly nothing extra, and one
 * called `8.pdf` gets read. Both are the right answer for their case.
 *
 * FUZZY counts as unanswered on purpose. A surname plus an initial is a guess,
 * and one parse that turns it into a certainty is cheaper than one payslip filed
 * against the wrong Weber.
 */
export function needsScan(
  match: Pick<FileMatch, 'confidence' | 'periodYear' | 'periodMonth'>,
  cadence: 'MONTHLY' | 'ANNUAL' | 'ONE_OFF',
): boolean {
  if (match.confidence !== 'EXACT') return true;
  switch (cadence) {
    case 'MONTHLY':
      return match.periodYear === null || match.periodMonth === null;
    case 'ANNUAL':
      return match.periodYear === null;
    case 'ONE_OFF':
      // Nothing to date — an answered name is the whole question.
      return false;
  }
}

/** What reading the file added, kept separate so a screen can show its origin. */
export interface ContentMatch {
  period: ContentPeriod | null;
  userId: string | null;
  reason: string | null;
}

export function readContent(text: string, candidates: MatchCandidate[]): ContentMatch {
  const period = readPeriodFromText(text);
  const member = matchTextToMember(text, candidates);
  return { period, userId: member?.userId ?? null, reason: member?.reason ?? null };
}

/**
 * The filename and the document, reconciled.
 *
 * The filename WINS where it speaks. A payroll system naming a file
 * `2026-08_mueller.pdf` is making a deliberate statement; text found on a page
 * is an inference, and the deliberate statement should not be overridden by one.
 * The document fills the silences — which, for `8.pdf`, is both of them.
 *
 * ⚠️ The one case that is neither: they both speak and DISAGREE. That is not a
 * tie to break, it is a signal that something is wrong with the batch — a file
 * renamed by hand, or the wrong PDF under the right name. The row goes back to
 * the human rather than picking whichever source we happened to trust more.
 */
export function mergeMatch(fromName: FileMatch, content: ContentMatch): FileMatch {
  let out: FileMatch = { ...fromName };

  // ---- period -------------------------------------------------------------
  const namePeriod = fromName.periodYear !== null;
  if (!namePeriod && content.period) {
    out = {
      ...out,
      periodYear: content.period.year,
      periodMonth: content.period.month,
      periodSource: 'content',
    };
  } else if (namePeriod && content.period) {
    const clash =
      content.period.year !== fromName.periodYear ||
      (fromName.periodMonth !== null && content.period.month !== fromName.periodMonth);
    if (clash) {
      out = { ...out, periodConflict: true };
    }
  }

  // ---- member -------------------------------------------------------------
  if (content.userId) {
    if (!fromName.userId) {
      // The document knows and the filename did not.
      out = {
        ...out,
        userId: content.userId,
        confidence: 'EXACT',
        reason: content.reason ?? 'found in the document',
        memberSource: 'content',
      };
    } else if (fromName.userId !== content.userId) {
      // Both spoke and they named different people. Refuse.
      out = {
        ...out,
        userId: null,
        confidence: 'UNMATCHED',
        reason: 'the filename and the document name different members',
      };
    } else if (fromName.confidence === 'FUZZY') {
      // The document confirms a guess, which promotes it to a certainty.
      out = { ...out, confidence: 'EXACT', reason: `${fromName.reason}, confirmed by the document` };
    }
  }

  return out;
}
