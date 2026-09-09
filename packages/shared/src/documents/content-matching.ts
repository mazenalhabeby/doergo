import {
  matchFile,
  type FileMatch,
  type MatchCandidate,
} from './batch-matching';

/**
 * Reading a document to find out whose it is and what it is for.
 *
 * The filename matcher next door reads `2026-08_holub_monika.pdf` and gets both
 * answers for free. Real files are not always named that way: a freelancer's
 * invoice arrives as `8.pdf` — the invoice NUMBER — while the page itself says
 * "DATE 31.08.2026" and carries the sender's name and email. Everything needed
 * was inside the file, and nothing looked.
 *
 * So this reads the text. It is held to the SAME standard as the filename
 * matcher, and the standard is the point: being wrong once is not something you
 * can take back, so every rule here refuses rather than guesses.
 *
 *   • a date is only a period when a LABEL says it is one
 *   • a due date is never a period, and is rejected explicitly
 *   • two labelled dates that disagree produce nothing
 *   • the filename and the document disagreeing is a reason to STOP, not to
 *     pick a winner
 *
 * Pure. The caller extracts the text; this decides what it means.
 */

/** A period read from a document, and the words that justified it. */
export interface ContentPeriod {
  year: number;
  month: number | null;
  /** The label this was found under, shown to whoever reviews the row. */
  label: string;
}

/*
  Labels that introduce the date a document is ABOUT.

  German and English, because an Austrian organization receives both, often in
  the same batch from the same freelancer.
*/
const ISSUE_LABELS = [
  'rechnungsdatum', 'leistungszeitraum', 'abrechnungszeitraum', 'zeitraum',
  'ausstellungsdatum', 'belegdatum', 'datum',
  'invoice date', 'issue date', 'issued', 'billing period', 'period', 'date',
];

/*
  Labels that introduce a date the document is NOT about.

  ⚠️ This list is what stops an invoice being filed a month late. `8.pdf` says
  "DATE 31.08.2026" and "DUE DATE 14.09.2026" — take the wrong one and August's
  invoice lands in September, where nobody looks for it and nobody notices,
  because the row still says "Freelancer Invoice".

  Checked BEFORE the issue labels and on the longer string, since "due date"
  contains "date" and would otherwise match both lists.
*/
const NOT_PERIOD_LABELS = [
  'due', 'fällig', 'faellig', 'zahlbar', 'payable', 'payment due',
  'valid until', 'gültig bis', 'gueltig bis', 'expiry', 'expires', 'ablauf',
  'geburtsdatum', 'date of birth', 'birth',
];

const MONTHS: Record<string, number> = {
  jan: 1, januar: 1, january: 1,
  feb: 2, februar: 2, february: 2,
  mar: 3, mär: 3, maerz: 3, marz: 3, märz: 3, march: 3,
  apr: 4, april: 4,
  mai: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, november: 11,
  dez: 12, dec: 12, dezember: 12, december: 12,
};

/** Normalise for label hunting: lowercase, diacritics folded, one space. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** One date found in the text, with the words immediately before it. */
interface DateHit {
  year: number;
  month: number;
  /** Up to 40 folded characters preceding the date. */
  before: string;
  raw: string;
}

/**
 * Every date in the text, with its run-up.
 *
 * ⚠️ Deliberately NOT `findDates` from ./dates-from-text, and the difference is
 * not an oversight. That one answers "when does this ID card expire" from OCR
 * noise: it dedupes by date, sorts chronologically and drops position, because
 * its rule is "the latest future date wins". This one answers "which date is
 * this document ABOUT", where the answer is decided entirely by the words in
 * front of the date — so position must survive, duplicates must survive, and
 * document order must survive. Merging them would break the one that works.
 *
 * Four written forms, all of them unambiguous about which number is the year.
 * `01.02.2026` is deliberately NOT read as a day/month pair beyond taking its
 * month — the day is irrelevant to a period, so the DD/MM vs MM/DD question
 * that ruins date parsing never has to be answered.
 */
function findDates(text: string): DateHit[] {
  const f = fold(text);
  const hits: DateHit[] = [];
  const push = (i: number, year: number, month: number, raw: string) => {
    if (month < 1 || month > 12) return;
    if (year < 2000 || year > 2100) return;
    hits.push({ year, month, before: f.slice(Math.max(0, i - 40), i), raw });
  };

  // 31.08.2026 · 31/08/2026 · 31-08-2026  (day first — European)
  for (const m of f.matchAll(/(?<!\d)(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})(?!\d)/g)) {
    push(m.index!, Number(m[3]), Number(m[2]), m[0]);
  }
  // 2026-08-31 · 2026/08/31  (ISO)
  for (const m of f.matchAll(/(?<!\d)(20\d{2})[-\/](\d{1,2})(?:[-\/]\d{1,2})?(?!\d)/g)) {
    push(m.index!, Number(m[1]), Number(m[2]), m[0]);
  }
  // 08/2026 · 08.2026  (month and year only)
  for (const m of f.matchAll(/(?<!\d)(0[1-9]|1[0-2])[.\/](20\d{2})(?!\d)/g)) {
    push(m.index!, Number(m[2]), Number(m[1]), m[0]);
  }
  // August 2026 · Aug. 2026 · 08 August 2026
  for (const m of f.matchAll(/(?<![a-z])([a-zä]{3,9})\.?\s+(20\d{2})(?!\d)/g)) {
    const month = MONTHS[m[1]!];
    if (month) push(m.index!, Number(m[2]), month, m[0]);
  }
  return hits;
}

const hasAny = (haystack: string, needles: string[]) => needles.some((n) => haystack.includes(n));

/**
 * The period this document is about, if the document says so plainly.
 *
 * Returns null far more often than it returns a value, and that is the design:
 * a row with no period is a question the reviewer answers in a second, while a
 * row with the WRONG period is a document filed where nobody will look for it.
 */
export function readPeriodFromText(text: string): ContentPeriod | null {
  const labelled = findDates(text).filter((h) => {
    if (hasAny(h.before, NOT_PERIOD_LABELS)) return false;
    return hasAny(h.before, ISSUE_LABELS);
  });
  if (labelled.length === 0) return null;

  // Every labelled date must agree on the month. One that does not is a
  // document this rule does not understand, and it says so by returning null.
  const first = labelled[0]!;
  const agree = labelled.every((h) => h.year === first.year && h.month === first.month);
  if (!agree) return null;

  const label = ISSUE_LABELS.find((l) => first.before.includes(l)) ?? 'date';
  return { year: first.year, month: first.month, label };
}

/** Every email address in the text, lowercased and deduplicated. */
export function readEmailsFromText(text: string): string[] {
  const found = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

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
