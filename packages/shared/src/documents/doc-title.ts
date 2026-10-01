/**
 * A document's NAME, read from its own heading.
 *
 * Every file filed under a type used to be called by the type: fourteen PDFs
 * for one member all read "Employment contract" — an insurance letter, a border
 * checklist, a driving authorisation and the contract itself, indistinguishable
 * in the register. The document already says what it is, on its first lines.
 *
 * What real letters look like (from the files that exposed this):
 *
 *     18pt  HBC USA Inc.                      ← the company: biggest, NOT the title
 *     12pt  INSURANCE CONFIRMATION LETTER     ← the title
 *     11pt  September 11, 2026
 *
 *     10pt  ANNEX B                           ← a label that belongs WITH the title
 *     16pt  DRIVING AUTHORIZATION
 *
 * So the rule scores the opening lines, and is deliberately conservative: it
 * returns null rather than a sentence from the body, and the caller keeps the
 * type's label. A wrong name is worse than a generic one.
 */

export interface TitleLine {
  text: string;
  /** Font size, when the source has it (a PDF's text layer). */
  size?: number;
}

/** Words that make a line a document's name, in the five languages. */
const DOC_WORDS = [
  // en
  'agreement', 'contract', 'letter', 'confirmation', 'certificate', 'authorization', 'authorisation', 'checklist',
  'policy', 'notice', 'statement', 'invitation', 'declaration', 'terms', 'rules', 'addendum', 'amendment', 'annex',
  'appendix', 'exhibit', 'schedule', 'form', 'report', 'invoice', 'receipt', 'payslip', 'pay slip', 'offer',
  'termination', 'resignation', 'reference', 'record', 'licence', 'license', 'permit', 'consent', 'acknowledgement',
  'acknowledgment', 'handbook', 'instruction', 'briefing', 'minutes', 'protocol', 'plan', 'request', 'application',
  // de
  'vertrag', 'vereinbarung', 'bestatigung', 'bescheinigung', 'kundigung', 'zeugnis', 'erklarung', 'anlage',
  'nachtrag', 'zusatz', 'einladung', 'richtlinie', 'hausordnung', 'belehrung', 'unterweisung', 'abrechnung',
  'lohnzettel', 'gehaltsabrechnung', 'genehmigung', 'vollmacht', 'nachweis', 'protokoll', 'antrag', 'formular',
  // fr
  'contrat', 'accord', 'attestation', 'lettre', 'avenant', 'certificat', 'reglement', 'autorisation', 'bulletin',
  // it
  'contratto', 'lettera', 'certificato', 'dichiarazione', 'regolamento', 'autorizzazione', 'allegato',
  // es
  'contrato', 'carta', 'certificado', 'constancia', 'declaracion', 'autorizacion', 'anexo', 'reglamento',
];

/** "ANNEX B", "Appendix 1", "Anlage 2" — a line that names a PART, to be joined to the title below it. */
const PART_LABEL = /^(annex|appendix|exhibit|schedule|attachment|anlage|anhang|annexe|allegato|anexo)\s+[A-Z0-9]{1,3}\.?$/i;

/** Lines that are never the name, whatever their size. */
const NOT_A_TITLE = [
  /^(to whom it may concern|dear\b|att\.?:|attn\.?:|prepared for|re:|betreff|sehr geehrte)/i,
  /@|https?:\/\/|www\./i,
  /\b(tel|phone|fax|telefon)\b.*\d/i,
  /^page \d+|^seite \d+/i,
  /\b\d{4,5}\s+[A-Z][a-z]+/, // a postcode and a town
];

/** Company forms: the letterhead line, not the title. */
const COMPANY = /\b(inc|llc|ltd|gmbh|ag|kg|corp|co|sa|sarl|srl|spa|bv|plc|e\.?u)\.?$/i;

/** Kept in capitals when a heading is re-cased. */
const ACRONYMS = new Set(['USA', 'US', 'NDA', 'EU', 'UK', 'HR', 'ID', 'GPS', 'PPE', 'HSE', 'CDL', 'DOT', 'OSHA', 'HBC', 'LLC', 'AG']);

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
  'und', 'der', 'die', 'das', 'des', 'den', 'dem', 'zur', 'zum', 'fur', 'von', 'mit', 'im',
  'de', 'du', 'la', 'le', 'les', 'et', 'di', 'del', 'della', 'e', 'el', 'y',
]);

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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
  const part = before && PART_LABEL.test(before)
    ? before.replace(/\.$/, '').replace(/^(\S+)\s+(\S+)$/, (_m, word: string, id: string) => `${titleCase(word.toUpperCase())} ${id.toUpperCase()}`)
    : null;
  return part ? `${part} – ${title}` : title;
}

/** Same, from plain text (an OCR read, a PDF's text without positions). */
export function documentTitleFromText(text: string, opts: { organizationName?: string | null } = {}): string | null {
  return documentTitleFromLines(text.split(/\r?\n/), opts);
}
