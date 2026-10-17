/** The business-card reader's public shapes (crm/business-card.ts is the entry). */

// ── The public shapes ───────────────────────────────────────────────────────

/**
 * One line of recognised text, as every OCR engine can supply it.
 *
 * ⚠️ `x`/`width` are OPTIONAL and must stay optional. They are what makes
 * column detection possible, but an engine that reports only a baseline and a
 * type size is still a usable engine — without them the reader degrades to
 * exactly the single-column behaviour it had before, rather than failing.
 */
export interface CardLine {
  text: string;
  /** Normalised 0–1 within the cropped card, so engines and resolutions agree. */
  y: number;
  /** Line height, normalised the same way. The name is usually the tallest. */
  height: number;
  /** Left edge, normalised across the card. Absent = no column information. */
  x?: number;
  /** Line width, normalised the same way. Absent = no column information. */
  width?: number;
}

export type FieldConfidence = 'certain' | 'likely';

/** A line that could have been this field, and how strongly. */
export interface CardCandidate {
  /** Index into `ParsedCard.lines`. */
  sourceIndex: number;
  value: string;
  /** 0–1. Comparable within a field, not across fields. */
  score: number;
}

export interface CardField {
  value: string;
  confidence: FieldConfidence;
  /** Which line it came from, so the screen can offer the alternatives. */
  sourceIndex: number;
  /** How strongly this line claimed the field, 0–1. */
  score: number;
  /**
   * The runners-up, best first.
   *
   * ⚠️ This is the difference between "pick a different line" showing every
   * line on the card and showing the two that were nearly chosen. A wrong
   * guess should be one tap to fix, not a scroll through a list.
   */
  alternatives: CardCandidate[];
  /**
   * The top two were close enough that the reader is guessing between them.
   *
   * This is the "ask, don't guess" signal: a card with two phone numbers and
   * no labels has no right answer, and saying so is better than picking.
   */
  contested: boolean;
}

/**
 * Is the biggest thing on this card the ORGANISATION or the PERSON?
 *
 * ⚠️ The old rule — "the largest text is the person" — is true on a personal
 * card and false on every card a company had designed, where the wordmark is
 * the largest thing by a wide margin and the person's name is set small
 * beneath it. Which way round it is has to be DECIDED, not assumed, and the
 * decision then flips the ranking rather than being applied as an exception.
 */
export type CardKind = 'COMPANY' | 'PERSON';

export interface CardKindVerdict {
  kind: CardKind;
  /** 0–1. Low means the card gave nothing away and the default was taken. */
  confidence: number;
  /** Machine-readable, so a screen or a test can say WHY without parsing prose. */
  reasons: CardKindReason[];
}

export type CardKindReason =
  | 'legal-form-is-largest'
  | 'largest-matches-email-domain'
  | 'largest-is-a-wordmark'
  | 'largest-is-person-shaped'
  | 'largest-carries-an-honorific'
  | 'email-names-the-largest-line'
  | 'role-line-present'
  | 'generic-mailbox'
  | 'personal-mailbox'
  | 'default-person';

export type CardRole = 'email' | 'phone' | 'website' | 'vat' | 'company' | 'name' | 'title' | 'address';

/**
 * What the label in front of a number said it was.
 *
 * ⚠️ `fax` is never offered as the phone. It is the one number on a card that
 * nobody wants dialled, and a card that prints `T:`, `F:` and `M:` on ONE line
 * used to hand back whichever came first — which on a municipal card is the
 * landline, with the fax a single regex away.
 */
export type CardPhoneKind = 'mobile' | 'landline' | 'fax' | 'unknown';

export interface CardPhone {
  value: string;
  kind: CardPhoneKind;
  /** Index into `ParsedCard.lines` — which line or segment it was read from. */
  sourceIndex: number;
}

export interface ParsedCard {
  name?: CardField;
  company?: CardField;
  title?: CardField;
  email?: CardField;
  phone?: CardField;
  website?: CardField;
  vat?: CardField;
  address?: CardField;
  /** Everything read, in reading order — the screen lets any field re-pick. */
  lines: string[];
  /** Which way round the card is, and why. */
  kind: CardKindVerdict;
  /**
   * The email's domain, when it names an EMPLOYER rather than a mail provider
   * — `t.huber@billa.at` → `billa.at`, `t.huber@gmail.com` → nothing.
   *
   * ⚠️ A free provider must suggest NOTHING. A suggestion is accepted with one
   * tap and corrected with ten, so the cost of a wrong one is asymmetric, and
   * "Gmail" offered as somebody's employer is wrong every single time.
   */
  companyDomain?: string;
  /**
   * A human-looking company name recovered from the domain — `gmunden.ooe.gv.at`
   * and `gmunden.at` both give "Gmunden".
   *
   * ⚠️ This exists because a card's company name is not always READABLE. The
   * card that prompted it prints its organisation as a hand-drawn script logo
   * that no text recogniser will ever make a word of, so the domain is the only
   * recoverable source for it. Offered as a starting point the member edits,
   * never as a fact — hence a field of its own rather than filling `company`.
   *
   * ⚠️ Silent for a mail provider, for a social host, and when the domain is
   * the PERSON'S OWN NAME (`arzt@nikiforova.at` on Dr Nikiforova's card), which
   * would otherwise offer somebody as their own employer.
   */
  companySuggestion?: string;
  /**
   * EVERY number the card printed, each typed by the label in front of it.
   *
   * `phone` stays the single best pick, so nothing that reads it has to change.
   * This is for a screen that wants to offer the other two — a card carries a
   * landline and a mobile and the office wants both on the record.
   */
  phones?: CardPhone[];
  /** How many columns the layout was read as. 1 when there is no geometry. */
  columns: number;
}
