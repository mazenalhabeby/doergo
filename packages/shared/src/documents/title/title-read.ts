/** Moved here unchanged from doc-title.ts. */
import { foldText } from '../../utils/fold';
import { ACRONYMS, COMPANY, DOC_WORDS, NOT_A_TITLE, PART_LABEL, SMALL_WORDS, type TitleLine } from './title-words';

const fold = foldText;

const looksLikeDate = (s: string) =>
  /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(s) ||
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i.test(s) ||
  /\b\d{1,2}\.?\s+(jan|feb|mar|apr|mai|may|jun|jul|aug|sep|okt|oct|nov|dez|dec)[a-z]*\.?\s+\d{4}\b/i.test(s);

/**
 * "INDEPENDENT CONTRACTOR AGREEMENT" → "Independent Contractor Agreement".
 * A line already in mixed case is left as written — somebody chose it.
 * Short all-caps words that look like acronyms (USA, NDA, EU) stay as they are.
 */
export function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w, i) => {
      if (!w.trim() || w === '-') return w;
      const upper = w.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      if (i > 0 && SMALL_WORDS.has(fold(w))) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join('');
}

/**
 * The document's name from its opening lines, or null when nothing reads like one.
 *
 * `organizationName`, when given, rules out the letterhead even without a
 * company suffix ("HBC Field" with no "Inc.").
 */
export function documentTitleFromLines(
  input: Array<string | TitleLine>,
  opts: { organizationName?: string | null } = {},
): string | null {
  const lines: TitleLine[] = input
    .map((l) => (typeof l === 'string' ? { text: l } : l))
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text.length > 0)
    .slice(0, 12);
  if (lines.length === 0) return null;

  const org = opts.organizationName ? fold(opts.organizationName).replace(/[^a-z0-9]/g, '') : null;
  const sizes = lines.map((l) => l.size ?? 0).filter((s) => s > 0);
  const bodySize = sizes.length ? sizes.slice().sort((a, b) => a - b)[Math.floor(sizes.length / 2)]! : 0;

  let best: { i: number; score: number } | null = null;
  lines.forEach((l, i) => {
    const t = l.text;
    if (t.length < 4 || t.length > 90) return;
    if (PART_LABEL.test(t)) return; // joined to the next line below, never a title on its own
    if (NOT_A_TITLE.some((r) => r.test(t)) || looksLikeDate(t)) return;
    if (COMPANY.test(t.replace(/[.,]+$/, ''))) return;
    if (org && fold(t).replace(/[^a-z0-9]/g, '') === org) return;
    // A sentence from the body: long, or ending in a full stop with many words.
    const words = t.split(' ').length;
    if (words > 9 || (/[.;:,]$/.test(t) && words > 4)) return;

    const folded = fold(t);
    let score = 0;
    if (DOC_WORDS.some((w) => new RegExp(`(^|[^a-z])${w}`).test(folded))) score += 5;
    if (t === t.toUpperCase() && /[A-Z]/.test(t)) score += 3;
    if (l.size && bodySize && l.size > bodySize) score += 2;
    score += Math.max(0, 3 - i * 0.5); // the name is near the top
    if (score < 5) return; // nothing about it says "name"
    if (!best || score > best.score) best = { i, score };
  });
  if (!best) return null;

  const pick = best as { i: number; score: number };
  const title = titleCase(lines[pick.i]!.text.replace(/[.:]+$/, ''));
  const before = lines[pick.i - 1]?.text;
  // "ANNEX B" → "Annex B": the identifier keeps its case ("A" is not the article).
  const part =
    before && PART_LABEL.test(before)
      ? before
          .replace(/\.$/, '')
          .replace(
            /^(\S+)\s+(\S+)$/,
            (_m, word: string, id: string) => `${titleCase(word.toUpperCase())} ${id.toUpperCase()}`,
          )
      : null;
  return part ? `${part} – ${title}` : title;
}

/** Same, from plain text (an OCR read, a PDF's text without positions). */
export function documentTitleFromText(text: string, opts: { organizationName?: string | null } = {}): string | null {
  return documentTitleFromLines(text.split(/\r?\n/), opts);
}
