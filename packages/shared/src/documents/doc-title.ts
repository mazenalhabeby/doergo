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
export type { TitleLine } from './title/title-words';
export { titleCase, documentTitleFromLines, documentTitleFromText } from './title/title-read';
