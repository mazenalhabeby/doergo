/**
 * Reading a business card, with no service and no model.
 *
 * The OCR step — Apple Vision on iOS, ML Kit on Android — hands back LINES,
 * not a customer. Every line arrives with a box, and that geometry carries
 * most of the meaning on a card: the name is set large, the contact details
 * are small and clustered, and a two-column card puts the firm on one side and
 * the person on the other.
 *
 * This file is the whole "intelligence", and it is deliberately plain rules
 * anybody can read, argue with and test. It runs on the phone, offline, and
 * costs nothing per scan.
 *
 * ⚠️ It is NOT allowed to be silently wrong. Fields it can prove — email,
 * phone, website, VAT — are returned as `certain`. Fields it infers — name,
 * company, title, address — are returned as `likely`, and the screen shows
 * that difference so nothing is saved on a guess nobody saw.
 *
 * ── How it decides ──────────────────────────────────────────────────────────
 *
 * It used to be a chain of `take()` calls: the first rule to touch a line
 * owned it, whatever a later rule might have had to say. That is one defect
 * wearing several hats. A website whose dot the reader lost stopped being a
 * website, so nothing marked the line used, so it fell through to the name
 * rule and `Www.dvd-personalcom` was offered as a person. The fix is not a
 * better website pattern — it is to stop letting ONE rule's failure hand a
 * line to an unrelated rule.
 *
 * So: every line is measured ONCE into facts; every (line, role) pair gets an
 * independent score from those facts; the best-scoring pairs are assigned
 * first, and a line is spoken for only when something actually wanted it. A
 * line that scores 0.9 as a website cannot become a name at 0.3 because the
 * capture regex had a bad day.
 *
 * The other thing that changed: the card is read as a LAYOUT. `x` and `width`
 * were thrown away in the conversion from pixels, so a two-column card came
 * out as interleaved lines in meaningless order and every "the line after the
 * name" rule collapsed. Columns are clustered first, and the card is read down
 * one column before moving to the next.
 *
 * ── A LINE IS NOT A FACT ────────────────────────────────────────────────────
 *
 * The third assumption, and the one a real card broke: that a line carries one
 * thing. A great many European cards use a decorative separator to put several
 * facts on one line —
 *
 *     Stadtamt Gmunden ~ Liegenschaftsverwaltung
 *     T: +43 7612 794 243 ~ F: +43 7612 794 258 ~ M: +43 676 88 794 243
 *
 * — and the reader took the whole string as the company, and the FIRST number
 * as the phone. So the organisation arrived glued to its department, the mobile
 * (the one number the person actually wanted dialled) was lost, and the fax was
 * one regex away from being offered instead.
 *
 * Lines are therefore SEGMENTED and each segment scored on its own. Two rules
 * keep that from destroying more than it fixes:
 *
 *  1. A separator counts only when it is SET OFF BY WHITESPACE (or is a run of
 *     two or more spaces). A hyphen inside "Liegenschafts-verwaltung", the
 *     slashes in "facebook.com/stadt.gmunden" and "01/02/2026", and the dash in
 *     a phone range are all glued to their neighbours and never split.
 *  2. Splitting may never LOSE a value. The whole line stays a candidate
 *     alongside its segments, and the two are resolved afterwards: the line
 *     stands unless at least TWO of its segments turned out to mean something
 *     on their own. "Müller | Söhne GmbH" has one meaningful half, so the
 *     separator was part of the name; "Stadtamt Gmunden ~ Liegenschafts-
 *     verwaltung" has two, so it was decoration.
 */
export type {
  CardLine,
  FieldConfidence,
  CardCandidate,
  CardField,
  CardKind,
  CardKindVerdict,
  CardKindReason,
  CardRole,
  CardPhoneKind,
  CardPhone,
  ParsedCard,
} from './card/types';
export { hasLegalForm } from './card/patterns-words';
export { segmentCardLine, readCardPhones } from './card/segment';
export { companyDomainFromEmail, companyNameFromDomain } from './card/facts';
export { cardColumns } from './card/columns-kind';
export { detectCardKind } from './card/measure';
export { scoreCardLines } from './card/score';
export { parseBusinessCard } from './card/parse';
export { type OcrLine, type CropRect, toCardLines } from './card/ocr-lines';
