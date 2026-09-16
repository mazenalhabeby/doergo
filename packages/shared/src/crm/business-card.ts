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

export type CardRole =
  | 'email' | 'phone' | 'website' | 'vat'
  | 'company' | 'name' | 'title' | 'address';

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

// ── Shapes that prove themselves ────────────────────────────────────────────

/*
  ⚠️ Every quantifier here is BOUNDED, and that is a security property rather
  than tidiness. This is pure parsing of untrusted text off a photograph, and
  an unbounded `{6,}` next to a character class that overlaps what follows it
  is how a regex goes exponential on an adversarial line. Nothing here is ever
  built from input — the only `new RegExp` in the file is assembled from
  constants at module load, once.
*/

const EMAIL = /[\w.+-]{1,64}@[\w-]{1,63}\.[\w.-]{2,40}/;

// Deliberately loose on separators and strict on length: a card writes a number
// a dozen ways, but seven digits is the floor for a real one. The upper bound
// exists so the class and the trailing digit cannot backtrack indefinitely.
const PHONE = /\+?\d[\d\s().\/-]{5,28}\d/;

/** The same shape, asked for EVERY number on a line rather than the first. */
const PHONE_SCAN = new RegExp(PHONE.source, 'g');

const VAT = /\b((?:ATU|DE|CHE|IT|FR|ESB|CZ|SK|HU)[\s-]?\d[\d\s-]{4,20}\d)\b/i;

/*
  The top-level domains a card is likely to print. Assembled into two patterns
  below rather than typed twice — the same list drifting between "is this a
  website" and "is this NOT a name" is precisely the bug this file exists to
  stop.
*/
const TLD = [
  'com', 'net', 'org', 'io', 'info', 'biz', 'shop', 'app', 'dev', 'eu',
  'at', 'de', 'ch', 'li', 'cz', 'sk', 'hu', 'si', 'hr', 'pl', 'it', 'fr',
  'es', 'pt', 'nl', 'be', 'lu', 'dk', 'se', 'no', 'fi', 'ie', 'uk', 'co\\.uk',
].join('|');

/**
 * A website, including one whose dot the reader lost.
 *
 * ⚠️ The loose half — the one that tolerates a missing separator before the
 * TLD — is allowed ONLY behind a `www` prefix, and that restriction is the
 * whole safety of it. Without the prefix, "privat", "automat", "kunde" and
 * "gebäude" all end in a country TLD, and the reader would start offering
 * ordinary German words as web addresses.
 *
 * Real failure this was written for: `Www.dvd-personalcom`. The dot before
 * "com" never made it through the scan, the strict pattern refused it, and the
 * line went on to be offered as somebody's NAME.
 */
const WEBSITE = new RegExp(
  '(?:https?:\\/\\/)?(?:' +
    // www vouches for the line, so the separators may be missing or misread.
    '(?:w\\s?w\\s?w)[\\s.,·_-]{0,2}[\\w-]{1,63}(?:[\\s.,·_-]{0,2})(?:' + TLD + ')\\b' +
    '|' +
    // Or an honest hostname with an honest dot.
    '(?:[\\w-]{1,63}\\.){1,4}(?:' + TLD + ')\\b' +
  ')(?:\\/\\S{0,200})?',
  'i',
);

/**
 * Is this line web-shaped AT ALL?
 *
 * ⚠️ Deliberately separate from `WEBSITE`, and deliberately looser. The
 * original defect was that a line only stopped being a name candidate when the
 * website CAPTURE succeeded — so one unrecognised TLD, one lost character, and
 * a URL was a person again. Exclusion must not be a side effect of capture.
 */
const WWW_PREFIX = /(^|\s)w\s?w\s?w[\s.,·_:-]/i;
const TLD_ANYWHERE = new RegExp('[\\w-][.,·](?:' + TLD + ')\\b', 'i');

/**
 * The words and single letters a card puts in front of a number.
 *
 * ⚠️ Scanned as a GLOBAL pattern over the text BEFORE each number, and the LAST
 * one found wins — a card writes "Tel/Fax +43 1 234 ~ M +43 664 555", and the
 * label nearest the number is the one that describes it.
 *
 * ⚠️ The single letters are the whole point of the rewrite. `FAX_LABEL` used to
 * be `/\bfax\b/` — the literal word — so the commonest European form, a bare
 * `F:` beside `T:` and `M:`, was invisible. On the card this was written for
 * the fax sat one position away from being handed over as the phone number.
 * They are safe here because they are matched only in the LABEL WINDOW, which
 * is the short run of text between one number and the next.
 */
const PHONE_LABEL = /\b(fax|fx|f|mobile|mobil|mob|cell|handy|m|tel|telefon|telephone|phone|festnetz|office|t|p)\b/gi;

const LABEL_KIND: Record<string, CardPhoneKind> = {
  fax: 'fax', fx: 'fax', f: 'fax',
  mobile: 'mobile', mobil: 'mobile', mob: 'mobile', cell: 'mobile', handy: 'mobile', m: 'mobile',
  tel: 'landline', telefon: 'landline', telephone: 'landline', phone: 'landline',
  festnetz: 'landline', office: 'landline', t: 'landline', p: 'landline',
};

/**
 * The glyphs a designer uses to put two facts on one line.
 *
 * ⚠️ `-` WAS deliberately absent, on the grounds that it is a hyphen inside a
 * compound word far more often than a separator and that splitting
 * "Liegenschafts-verwaltung" yields a department nobody can search for. That
 * reasoning was wrong, and its own next sentence said so: the whitespace rule
 * below is what protects compounds, which is exactly why – and — were allowed.
 * A hyphen inside a word has no space around it; a decorative one does.
 *
 * It matters because the recogniser does not return what the card prints. The
 * Gmunden card's raised tilde came back as `_` on one read and as a spaced `-`
 * on the next, and with `-` missing the org was glued to its department again:
 *
 *     Stadtamt Gmunden - Liegenschaftsverwaltung
 *
 * Still safe for compounds ("Liegenschafts-verwaltung"), postcodes ("A-1010")
 * and ranges ("794 243-258") — none of them space the hyphen.
 */
/*
  ⚠️ `_` IS IN THIS SET BECAUSE OF WHAT THE RECOGNISER RETURNS, NOT WHAT THE
  CARD SHOWS.

  The Gmunden card is printed with a small raised tilde between its halves, and
  on a real device ML Kit read every one of them as an UNDERSCORE:

      Rathausplatz 1_ 4810 Gmunden
      T: … 243 _ F: … 258 _ M: … 243

  So the address kept its separator and the phone line never split, which put
  the landline in `phone` and lost the mobile — the exact fault this whole
  mechanism was built to fix, reintroduced by one glyph.

  It is safe for the same reason every other glyph here is: the whitespace rule
  below. `snake_case_identifier` and `file_name.pdf` have no space around the
  underscore and are never cut.
*/
const SEPARATOR_GLYPHS = '~·•|/–—∙⋅_-';

/**
 * A decorative separator: a glyph SET OFF BY WHITESPACE, a tab, or a run of two
 * or more spaces.
 *
 * ⚠️ The whitespace requirement is the entire safety of this. Without it `/`
 * cuts "facebook.com/stadt.gmunden" into two halves that are neither a website
 * nor anything else, and "01/02/2026" becomes three numbers.
 *
 * ⚠️ The glyph alternative must come FIRST. `\s{2,}` would otherwise swallow
 * the spaces in front of a glyph and leave it stranded at the head of the next
 * segment.
 *
 * Linear: the whitespace and glyph classes are disjoint, so there is nothing
 * for the engine to backtrack over.
 */
const CARD_SEPARATOR = new RegExp('\\s+[' + SEPARATOR_GLYPHS + ']+\\s+|\\t+|\\s{2,}');
const SEPARATOR_EDGE = new RegExp('^[' + SEPARATOR_GLYPHS + '\\s]+|[' + SEPARATOR_GLYPHS.replace('/', '') + '\\s]+$', 'g');

/**
 * How many facts one line may hold.
 *
 * A card line with seven things on it does not exist; a badly-recognised block
 * of justified text with runs of spaces in it very much does. The cap is what
 * keeps the work bounded — every segment becomes a line the whole scoring table
 * runs over, so an uncapped split turns one bad line into a hundred.
 */
const MAX_SEGMENTS = 6;

/** A line is not a phone book either. */
const MAX_PHONES_PER_LINE = 6;

/**
 * How much of its line's TYPE SIZE a piece inherits.
 *
 * ⚠️ This is what stops a split from inventing facts. Type size is the designer
 * saying "this LINE matters", and several rules read it as a prior — so a piece
 * of the biggest line on the card arrives already most of the way to being the
 * company or the name, on no evidence about its own text at all. "Bau ~ Tec"
 * then produces two company candidates, both meaningless, and the pair of them
 * is enough to suppress the line they came from.
 *
 * Discounted, a piece has to bring something of its own — a legal form, the
 * email's domain, a person's shape, an address signal, a number — which is
 * exactly the evidence the split is supposed to be revealing. "TEC | Anlagenbau
 * GmbH" keeps its separator; "Stadtamt Gmunden ~ Liegenschaftsverwaltung" does
 * not, because both of its halves can argue for themselves.
 */
const SEGMENT_SIZE_SHARE = 1 / 3;

/** Suffixes that mark a line as an organisation rather than a person. */
const LEGAL_FORM = /\b(gmbh|ag|ges\.?m\.?b\.?h|kg|og|e\.?u\.?|ltd|limited|inc|llc|plc|s\.?r\.?o|sp\.?\s?z\.?o\.?o|bv|nv|sa|srl|spa|oy|ab|a\/s|aps)\b/i;

/**
 * The same letters with their accents taken off.
 *
 * ⚠️ `\b` in JavaScript is defined on `[A-Za-z0-9_]`, so "Ä" is not a word
 * character and there is no boundary in front of it. `\bärztin\b` therefore
 * never matches "Ärztin für Allgemeinmedizin" — it fails silently, on a real
 * card, in the one language this product ships most. Folding the text and
 * writing the patterns in plain ASCII keeps them readable and makes the
 * boundaries real.
 */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/*
  Words that mark a line as a job title, in the languages this product ships.

  ⚠️ Written WITHOUT accents on purpose — see `fold`. "geschaftsfuhr" is not a
  typo, and matching is done through `isRole`, never against this directly.

  ⚠️ "dr" is deliberately absent, and must stay absent. It is part of a person's
  name on half the cards in this market — matching it here would rule the NAME
  out as a name and offer it as the job title instead.
*/
const ROLE = /\b(head|chief|director|manager|lead|leiter|leitung|geschaftsfuhr|prokurist|inhaber|owner|founder|ceo|cto|cfo|coo|president|vp|vice|senior|junior|engineer|ingenieur|techniker|sales|vertrieb|einkauf|purchas|account|consultant|berater|assistant|assistenz|coordinator|koordinator|supervisor|meister|partner|architekt|projekt|project|arzt|arztin|arzte|zahnarzt|physician|anwalt|attorney|lawyer|notar|steuerberater|apotheker|pharmacist|therapeut|therapist|hebamme|trainer|coach)\b/i;

/*
  ⚠️ German writes a job title as ONE WORD, and `\b` cannot see inside it.
  "Projektleiter", "Geschäftsführer", "Abteilungsleiter" and "Rechtsanwalt" all
  failed the pattern above — the boundary before "leiter" is the "t" of
  "Projekt", so it never matched. The list was written as if German titles were
  two words, and in the language this product ships most they are one.

  These stems are matched ANYWHERE inside a word. Every one of them is at least
  five letters and is not a fragment of an unrelated German word, which is the
  reason short and ambiguous tokens ("lead", "vp", "m") stay above, anchored.
*/
const ROLE_STEM = /(geschaftsfuhr|leiter|leitung|prokurist|inhaber|vertrieb|einkauf|techniker|ingenieur|anwalt|arzt|apotheker|berater|meister|architekt|koordinator|assistenz|therapeut)/i;

const isRole = (t: string) => {
  const f = fold(t);
  return ROLE.test(f) || ROLE_STEM.test(f);
};

/*
  ── An organisation and the part of it this person works in ─────────────────

  A public body, a hospital or any firm past a certain size prints BOTH on the
  card, usually on one line with a separator between them:

      Stadtamt Gmunden ~ Liegenschaftsverwaltung

  The organisation is the client; the department is what this person does there,
  which is a `title` in every sense the product has. Telling them apart is the
  only new judgement here, and there are two signals.
*/

/**
 * Words that name a PART of an organisation rather than the organisation.
 *
 * Matched anywhere inside a word, because German glues them on: the department
 * is "Liegenschaftsverwaltung", not "Liegenschaften Verwaltung". Each stem is
 * long enough not to be a fragment of an unrelated word, for the same reason
 * `ROLE_STEM` next door is.
 */
const DEPARTMENT_STEM = /(verwaltung|abteilung|referat|dezernat|sachgebiet|fachbereich|stabsstelle|geschaftsstelle|department|division)/i;

/**
 * An administrative AUTHORITY: a thing that IS an organisation.
 *
 * ⚠️ "-amt" looks like a department suffix and is not one. "Stadtamt",
 * "Finanzamt", "Gemeindeamt" are whole bodies — on the card this file was
 * rewritten for, "Stadtamt Gmunden" IS the client. Listing it as a department
 * stem was tried and produced exactly the wrong half of the line, so it sits
 * here instead, where it names an organisation and VETOES the department test.
 *
 * ⚠️ `{3,20}` before "amt" with a stop-list in front: "gesamt" is a perfectly
 * ordinary German word and would otherwise make an authority of any line
 * carrying it.
 */
const AUTHORITY = /\b(?!gesamt|insgesamt|allesamt)[a-z]{3,20}amt\b|\b(magistrat|rathaus|behorde|ministerium|stadtgemeinde|marktgemeinde|bezirkshauptmannschaft)\b/i;

/*
  ── Addresses ──────────────────────────────────────────────────────────────

  ⚠️ The old rule demanded a postcode line and joined only the street line
  IMMEDIATELY ABOVE it. That reads exactly one layout. A card that prints the
  address on a single line, or puts the postcode first (as the UK and the
  Netherlands do), or separates the two with a country, all came back with
  either half an address or none.

  So there is no "the postcode line" any more — there are address SIGNALS, and
  adjacent lines carrying any of them are assembled into a block, in whatever
  order the card printed them.
*/

/**
 * ⚠️ No leading `\b` on the German suffixes, on purpose. "Siemensstraße" is one
 * word, so a boundary before "straße" never occurs and the pattern that
 * demanded one matched no German street at all. The TRAILING boundary is what
 * keeps "Bewegung" and "unterwegs" out.
 */
const STREET = /(?:stra(?:ss|ß)e|str\.|gasse|platz|allee|weg|\bring\b|\broad\b|\bstreet\b|\bst\.|\bave\b|\bavenue\b|\blane\b|\bdrive\b|\bboulevard\b|\bblvd\b|\bsquare\b|\bvia\b|\brue\b|straat|\blaan\b|\bplein\b)/i;
const HOUSE_NUMBER = /(?:^|[\s,])\d{1,4}\s?[a-zA-Z]?(?:$|[\s,\/])/;
/** A postcode next to a town, and the national shapes that are not that. */
const POSTCODE = /(?:(?:^|[^\d+])\d{4,5}\s+[A-Za-zÄÖÜäöüß]|\b[A-Z]{1,2}-\d{4,5}\b|\b\d{4}\s?[A-Z]{2}\b|\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b)/;
const COUNTRY = /\b(austria|osterreich|germany|deutschland|switzerland|schweiz|suisse|italy|italia|italien|france|frankreich|spain|espana|spanien|netherlands|nederland|niederlande|belgium|belgien|czechia|cesko|tschechien|slovakia|slovensko|hungary|ungarn|poland|polska|polen|slovenia|slovenija|croatia|hrvatska|united kingdom|great britain|england|scotland|wales|ireland|usa|united states)\b/i;

/**
 * Honorifics and post-nominals, which a person's name carries and a company's
 * does not. Stripped before the "two capitalised words" test so that
 * "Dr. Dilyana Nikiforova" is still recognisably a person.
 */
const HONORIFIC = /^(dr|ddr|mag|ing|di|dipl|prof|mmag|mr|mrs|ms|herr|frau|msc|bsc|ba|ma|mba|phd|llm|cfa)$/i;

/** Mailboxes that belong to a FUNCTION, not to a person. */
const GENERIC_LOCAL = new Set([
  'office', 'info', 'kontakt', 'contact', 'mail', 'email', 'e-mail', 'hello',
  'hallo', 'sales', 'verkauf', 'service', 'support', 'admin', 'buero', 'buro',
  'team', 'welcome', 'praxis', 'ordination', 'empfang', 'reception', 'post',
  'anfrage', 'shop', 'billing', 'rechnung', 'noreply', 'no-reply',
]);

/**
 * Hosts that sell mailboxes rather than employ people.
 *
 * Checked against both the full domain and its first label, because a card
 * writes `gmx.at` and `gmx.de` and `web.de` and they are all the same answer:
 * this address says nothing about who the person works for.
 */
const FREE_MAIL_LABEL = new Set([
  'gmail', 'googlemail', 'outlook', 'hotmail', 'live', 'msn', 'yahoo', 'ymail',
  'gmx', 'web', 'icloud', 'me', 'mac', 'proton', 'protonmail', 'aol', 'aim',
  't-online', 'freenet', 'posteo', 'mailbox', 'zoho', 'fastmail', 'hey',
  'tutanota', 'tuta', 'yandex', 'mail', 'email', 'a1', 'aon', 'chello',
  'inode', 'kabsi', 'utanet', 'qq', '163',
]);

/** A card line is text, not a document. Everything downstream is bounded by this. */
const MAX_LINE_CHARS = 300;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE_CHARS);

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * One line → the facts printed on it.
 *
 * Returns `[whole]` for an ordinary line, so every caller has one shape to
 * handle. A line that splits returns its pieces and NOT the whole — the caller
 * (`measure`) keeps the whole line itself, because deciding whether the split
 * was decoration needs the scores, which do not exist yet.
 *
 * ⚠️ Pure and exported on purpose: the rule about what a separator IS is the
 * argument this change rests on, and it is worth being able to test it without
 * a card around it.
 */
export function segmentCardLine(text: string): string[] {
  // Exported, so it is handed whatever a caller has. Nothing in this file throws.
  if (typeof text !== 'string') return [];
  const whole = clean(text);
  if (!whole) return [];
  // Bounded before anything else: this runs on a photograph's worth of text.
  const raw = text.slice(0, MAX_LINE_CHARS * 2);
  const parts = raw
    .split(CARD_SEPARATOR)
    .map((p) => clean(p.replace(SEPARATOR_EDGE, '')))
    // One character is punctuation, not a fact. Same floor `measure` uses.
    .filter((p) => p.length > 1);
  // Too many pieces means the line was never a list of facts — see MAX_SEGMENTS.
  if (parts.length < 2 || parts.length > MAX_SEGMENTS) return [whole];
  return parts;
}

/**
 * Every number on one piece of text, each typed by the label in FRONT of it.
 *
 * ⚠️ The label window is the text since the previous number ended, which is
 * what makes this work inside a line as well as across lines: on
 * "T: 1234567 ~ F: 7654321" the second number's window is " ~ F: " and nothing
 * else. The old code asked whether the LINE mentioned a mobile anywhere, which
 * is the same answer for all three numbers on a line that carries all three.
 */
export function readCardPhones(text: string): { value: string; kind: CardPhoneKind }[] {
  const out: { value: string; kind: CardPhoneKind }[] = [];
  if (typeof text !== 'string') return out;
  /*
    ⚠️ `lastIndex` is reset here and not trusted from the last call. The loop
    below can stop early on the cap, which leaves the shared pattern pointing
    into the middle of some other card's line — and a global regex that
    remembers where it got to is the classic way a scan silently skips the first
    number on the next thing it is asked about.
  */
  PHONE_SCAN.lastIndex = 0;
  let cursor = 0;
  let found: RegExpExecArray | null;
  while (out.length < MAX_PHONES_PER_LINE && (found = PHONE_SCAN.exec(text)) !== null) {
    // PHONE cannot match empty, so `lastIndex` always advances and this ends.
    out.push({ value: clean(found[0]), kind: labelKind(text.slice(cursor, found.index)) });
    cursor = found.index + found[0].length;
  }
  return out;
}

/** The LAST label in the window describes the number that follows it. */
function labelKind(window: string): CardPhoneKind {
  const folded = fold(window);
  PHONE_LABEL.lastIndex = 0;
  let kind: CardPhoneKind = 'unknown';
  let hit: RegExpExecArray | null;
  while ((hit = PHONE_LABEL.exec(folded)) !== null) {
    kind = LABEL_KIND[hit[1]!.toLowerCase()] ?? kind;
  }
  return kind;
}

/**
 * The number a person actually wants dialled.
 *
 * A labelled mobile first, then anything that is not a fax. A fax alone answers
 * NOTHING — which is what keeps it out of the phone field while the line it
 * sits on stays excluded from being read as somebody's name.
 */
function dialable(phones: { value: string; kind: CardPhoneKind }[]) {
  return phones.find((p) => p.kind === 'mobile')
    ?? phones.find((p) => p.kind === 'landline')
    ?? phones.find((p) => p.kind === 'unknown');
}

// ── Measuring a line, once ──────────────────────────────────────────────────

/**
 * Everything any rule needs to know about one line, computed in a single pass.
 *
 * ⚠️ The point of this struct is that no field asks the same question twice. A
 * card is tens of lines and this runs while the camera is still warm; the old
 * shape re-scanned the whole card once per field, with the regexes re-tested
 * inside `filter` callbacks. Here each pattern touches each line exactly once.
 */
interface LineFacts {
  i: number;
  text: string;
  folded: string;
  /** Letters and digits only, lower case — for domain containment tests. */
  squashed: string;
  y: number;
  height: number;
  x?: number;
  width?: number;
  /** Which column the line was read in, and where in it. */
  column: number;
  rowInColumn: number;
  /** Height as a fraction of the tallest line on the card. */
  relSize: number;

  /**
   * Where this fact came from, when the line it is on carried several.
   *
   * `pieces` on the whole line, `partOf` on each piece. They are RIVALS, never
   * both an answer: `resolveSegments` decides which survives, and the loser is
   * `suppressed`. See the header — splitting must never lose a value, so the
   * whole line is measured and scored exactly like its pieces are.
   */
  pieces?: number[];
  partOf?: number;
  suppressed: boolean;

  email?: string;
  /** Any phone-shaped thing, fax included — it is what rules a line OUT elsewhere. */
  phone?: string;
  website?: string;
  vat?: string;

  /** Every number on the fact, typed. */
  phones: { value: string; kind: CardPhoneKind }[];
  /** The one worth dialling, or nothing when all this fact holds is a fax. */
  dial?: { value: string; kind: CardPhoneKind };

  hasDigits: boolean;
  words: number;
  legalForm: boolean;
  role: boolean;
  /** Part of an organisation rather than the organisation — a `title`, not a client. */
  department: boolean;
  /** An administrative body. A thing that IS an organisation. */
  authority: boolean;
  urlish: boolean;
  personShape: boolean;
  wordmark: boolean;
  /** Own address signals, before any neighbour is considered. */
  addressSignal: number;
  /** The line contains the employer's domain name. */
  domainMatch: boolean;
  /** The line contains a word from the email's local part ("a.gruber" → Gruber). */
  localMatch: boolean;
}

interface Ctx {
  kind: CardKind;
  /** Local part of the email, when it looks like a person's rather than a desk's. */
  personalLocal?: string;
  /** Provisional best guess at the name line — context only, never an assignment. */
  nameHint: number;
  /**
   * The text of that guess.
   *
   * Carried alongside the index because a scorer is handed one fact and the
   * context, never the whole card — and telling a mangled email from a web
   * address needs the person's name, not its position.
   */
  nameText?: string;
}

/**
 * Two or three capitalised words, once the letters after somebody's name and
 * the titles in front of it are set aside.
 */
function isPersonShape(text: string): boolean {
  const core = personCore(text);
  if (core.length < 2 || core.length > 3) return false;
  // A surname is printed in full capitals on plenty of cards, so both shapes count.
  if (!core.every((t) => /^[A-Z][A-Za-z'’-]{0,24}$/.test(t) || /^[A-Z]{2,24}$/.test(t))) return false;
  /*
    ⚠️ At least one word must be in Title case, not shouted.

    "DVD PERSONAL" and "ANNA GRUBER" are the same shape to a computer, and a
    two-word wordmark set in capitals was being read as a person — which is the
    exact card this file now has to get right. A person's card writes the given
    name in Title case even when the surname is capitalised ("Dr. Dilyana
    NIKIFOROVA"); a wordmark shouts the whole thing.
  */
  return core.some((t) => /^[A-Z][a-z]/.test(t));
}

/** The words of a name once the letters in front of it are set aside. */
function personCore(text: string): string[] {
  const tokens = fold(text).split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 5) return [];
  return tokens.filter((t) => !HONORIFIC.test(t.replace(/[.,]/g, '')));
}

/** "Dr.", "Mag.", "Ing." — letters a firm's name never carries. */
const hasHonorific = (text: string) =>
  fold(text).split(/\s+/).some((t) => t.length > 0 && HONORIFIC.test(t.replace(/[.,]/g, '')));

/** A short, shouted line: what a logo's wordmark looks like once it is text. */
function isWordmark(text: string): boolean {
  if (text.length < 3 || text.split(' ').length > 3) return false;
  if (!/[A-ZÄÖÜ]/.test(text)) return false;
  return !/[a-zäöüß]/.test(text);
}

/**
 * The strongest free signal on a card: the email's domain names the company.
 *
 * `a.gruber@siemens.com` → the line containing "siemens" IS the company, in
 * whatever form the card writes it ("Siemens AG"). No vocabulary, no model,
 * and it works in any language.
 *
 * ⚠️ Free providers answer nothing. See `ParsedCard.companyDomain`.
 */
export function companyDomainFromEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const domain = email.split('@')[1]?.toLowerCase().replace(/[^a-z0-9.-]/g, '');
  if (!domain || !domain.includes('.')) return undefined;
  const label = domain.split('.')[0]!;
  if (label.length < 2) return undefined;
  if (FREE_MAIL_LABEL.has(label) || FREE_MAIL_LABEL.has(domain)) return undefined;
  return domain;
}

/**
 * Labels that belong to the PUBLIC part of a domain, not to its owner.
 *
 * ⚠️ Chopping one label off the right is not enough, and the card this was
 * written for is why: `gmunden.ooe.gv.at` is the city of Gmunden, three levels
 * down. `ooe` is a federal state, `gv` is the public sector, `at` is the
 * country — none of them names anybody. Stripping from the right while the
 * label is public leaves exactly the registrable name.
 */
const PUBLIC_LABEL = new Set([
  ...TLD.split('|').map((t) => t.replace('\\.', '.')),
  // The second level: `co.uk`, `gv.at`, `ac.at`, `or.at`, `com.au`…
  'co', 'gv', 'ac', 'or', 'ne', 'priv', 'gov', 'edu', 'mil', 'sch', 'nhs', 'police',
  // And the Austrian states under `gv.at`, which is a third level.
  'ooe', 'noe', 'stmk', 'ktn', 'sbg', 'tirol', 'vlbg', 'wien', 'bgld',
]);

/** Hosts that publish a PAGE about somebody rather than belonging to them. */
const SOCIAL_HOST = new Set([
  'facebook', 'fb', 'instagram', 'linkedin', 'twitter', 'x', 'xing', 'youtube',
  'tiktok', 'pinterest', 'wordpress', 'blogspot', 'wixsite', 'jimdo', 'wa', 't',
]);

/**
 * A domain a person could read as a company name: `gmunden.ooe.gv.at` → "Gmunden".
 *
 * ⚠️ This exists for the card whose company name is UNREADABLE — a hand-drawn
 * script logo that no recogniser will make a word of. The domain is then the
 * only surviving trace of who the person works for, and "Gmunden" offered for
 * editing beats an empty field and a re-scan that will fail the same way.
 *
 * ⚠️ A free provider and a social host both answer NOTHING. "Gmail" and
 * "Facebook" as somebody's employer are wrong every single time, and a
 * suggestion is accepted with one tap and corrected with ten.
 */
export function companyNameFromDomain(domain?: string): string | undefined {
  const host = domain?.toLowerCase().replace(/^https?:\/\//, '').split('/')[0]?.replace(/[^a-z0-9.-]/g, '');
  if (!host || !host.includes('.')) return undefined;
  const labels = host.split('.').filter(Boolean);
  if (labels[0] === 'www') labels.shift();
  if (!labels.length) return undefined;
  if (FREE_MAIL_LABEL.has(labels[0]!) || FREE_MAIL_LABEL.has(labels.join('.'))) return undefined;
  if (SOCIAL_HOST.has(labels[0]!)) return undefined;

  // Strip the public suffix from the right; what is left is the owner's name.
  const owned = labels.slice();
  while (owned.length > 1 && PUBLIC_LABEL.has(owned[owned.length - 1]!)) owned.pop();
  const name = owned[owned.length - 1];
  if (!name || name.length < 2 || FREE_MAIL_LABEL.has(name) || SOCIAL_HOST.has(name)) return undefined;

  /*
    Title case, one word per dash. `dvd-personal` is printed "DVD Personal" on
    the card itself — the punctuation is the domain's, never the company's.
  */
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** The host a website line points at: `WWW.NIKIFOROVA.AT/kontakt` → `nikiforova.at`. */
function websiteHost(website?: string): string | undefined {
  if (!website) return undefined;
  const host = website
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    // The reader tolerates a scan that lost the separators inside "w w w".
    .replace(/^w\s?w\s?w[\s.,·_-]{0,2}/, '')
    .split(/[/\s]/)[0];
  return host && host.includes('.') ? host : undefined;
}

/**
 * The part of the domain a card would actually print: `billa.at` → `billa`.
 *
 * ⚠️ Punctuation is stripped, because the card and the domain do not agree on
 * it: `dvd-personal.at` is printed "DVD Personal". Comparing the hyphenated
 * label against a squashed line matched nothing — the company on a real card
 * went unrecognised for the sake of one dash.
 */
const domainWord = (domain?: string) => domain?.split('.')[0]?.replace(/[^a-z0-9]/g, '');

/** `t.huber` → ["huber"]. A desk's mailbox answers nothing. */
function localWords(email?: string): { words: string[]; personal: boolean } {
  const local = email?.split('@')[0]?.toLowerCase();
  if (!local) return { words: [], personal: false };
  if (GENERIC_LOCAL.has(local)) return { words: [], personal: false };
  const words = local.split(/[._-]+/).filter((w) => w.length >= 3);
  return { words, personal: words.length > 0 };
}

// ── Columns ─────────────────────────────────────────────────────────────────

const GUTTER = 0.04;
const COLUMN_OVERLAP = 0.35;

/**
 * Group lines into columns, left to right, and order each one top to bottom.
 *
 * ⚠️ Conservative by design: it answers "one column" unless the card is
 * unmistakably two. A false split is worse than a missed one, because it
 * scrambles the reading order of a perfectly ordinary card — so a candidate
 * split must survive all three tests (a real gutter with no horizontal
 * overlap, at least two lines a side, and columns that run ALONGSIDE each
 * other rather than one below the next) or the whole thing collapses back to a
 * single column sorted by y.
 *
 * Returns indices into the input array. With no `x`/`width` it returns the
 * input order untouched — an engine that cannot report geometry still works.
 */
export function cardColumns(lines: CardLine[]): number[][] {
  const single = lines.map((_, i) => i);
  if (lines.length < 4) return [single];
  if (lines.some((l) => typeof l.x !== 'number' || typeof l.width !== 'number')) return [single];

  const byLeft = single.slice().sort((a, b) => lines[a]!.x! - lines[b]!.x! || lines[a]!.y - lines[b]!.y);

  const columns: number[][] = [];
  let current: number[] = [];
  let maxRight = -Infinity;
  for (const i of byLeft) {
    const l = lines[i]!;
    if (current.length && l.x! > maxRight + GUTTER) {
      columns.push(current);
      current = [];
      maxRight = -Infinity;
    }
    current.push(i);
    maxRight = Math.max(maxRight, l.x! + Math.max(0, l.width!));
  }
  if (current.length) columns.push(current);
  if (columns.length < 2) return [single];

  // Every column must be a column: at least two lines, and running beside its
  // neighbour rather than stacked above it.
  const span = (col: number[]) => {
    const top = Math.min(...col.map((i) => lines[i]!.y));
    const bottom = Math.max(...col.map((i) => lines[i]!.y + Math.max(0, lines[i]!.height)));
    return { top, bottom, size: Math.max(1e-6, bottom - top) };
  };
  if (columns.some((c) => c.length < 2)) return [single];
  for (let k = 1; k < columns.length; k++) {
    const a = span(columns[k - 1]!);
    const b = span(columns[k]!);
    const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (overlap / Math.min(a.size, b.size) < COLUMN_OVERLAP) return [single];
  }

  return columns.map((c) => c.slice().sort((p, q) => lines[p]!.y - lines[q]!.y));
}

// ── Which way round is this card? ───────────────────────────────────────────

function kindFromFacts(facts: LineFacts[], hasGenericMailbox: boolean, hasPersonalMailbox: boolean): CardKindVerdict {
  const reasons: CardKindReason[] = [];
  if (facts.length === 0) return { kind: 'PERSON', confidence: 0, reasons: ['default-person'] };

  /*
    The argument is about ONE line: the biggest thing the designer set. That is
    the line the old rule handed to the name field unconditionally, and it is
    the only line whose identity actually changes the ranking.
  */
  let largest = facts[0]!;
  for (const f of facts) if (f.height > largest.height) largest = f;

  // Positive is the company's card; negative is the person's.
  let score = 0;
  const add = (v: number, why: CardKindReason) => { score += v; reasons.push(why); };

  if (largest.legalForm) add(0.6, 'legal-form-is-largest');
  if (largest.domainMatch) add(0.5, 'largest-matches-email-domain');
  if (largest.localMatch) add(-0.6, 'email-names-the-largest-line');
  if (largest.personShape && !largest.legalForm) add(-0.45, 'largest-is-person-shaped');
  if (hasHonorific(largest.text)) add(-0.4, 'largest-carries-an-honorific');
  /*
    ⚠️ The condition is "and somebody ELSE on this card looks like a person".
    A wordmark with nobody beneath it is a card with one name on it, and that
    name is as likely to be the person's set in capitals.
  */
  if (largest.wordmark && facts.some((f) => f !== largest && f.personShape)) {
    add(0.45, 'largest-is-a-wordmark');
  }
  // A job title is printed because a PERSON holds it.
  if (facts.some((f) => f.role)) add(-0.2, 'role-line-present');
  if (hasGenericMailbox) add(0.2, 'generic-mailbox');
  if (hasPersonalMailbox) add(-0.15, 'personal-mailbox');

  if (Math.abs(score) < 0.05) {
    // What the file assumed for years, now stated as a default with a low
    // confidence rather than as a fact.
    return { kind: 'PERSON', confidence: 0, reasons: reasons.length ? reasons : ['default-person'] };
  }
  return {
    kind: score > 0 ? 'COMPANY' : 'PERSON',
    confidence: Math.min(1, Math.round(Math.abs(score) * 100) / 100),
    reasons,
  };
}

/** The kind detector, callable on its own — it is the part most worth arguing with. */
export function detectCardKind(raw: CardLine[]): CardKindVerdict {
  const { facts, generic, personal } = measure(raw);
  return kindFromFacts(facts, generic, personal);
}

// ── The scoring table ───────────────────────────────────────────────────────

/**
 * One table, one shape per role — not a branch per field.
 *
 * `min` is the floor below which a role is left EMPTY. An empty field the
 * person fills in beats a confident wrong one they have to notice first.
 * `proven` marks the roles a pattern can actually demonstrate; everything else
 * comes back `likely` and the screen badges it CHECK.
 */
interface RoleSpec {
  min: number;
  proven: boolean;
  score(f: LineFacts, c: Ctx): number;
  /** What goes in the field, and any other lines this claim consumes. */
  claim(f: LineFacts, c: Ctx, all: LineFacts[]): { value: string; also: number[] };
}

const plain = (f: LineFacts) => ({ value: f.text, also: [] as number[] });
const cap = (n: number) => Math.max(0, Math.min(0.99, n));

const ROLES: Record<CardRole, RoleSpec> = {
  email: {
    min: 0.1, proven: true,
    score: (f) => (f.email ? 0.98 : 0),
    claim: (f) => ({ value: f.email!.toLowerCase(), also: [] }),
  },

  vat: {
    min: 0.1, proven: true,
    score: (f) => (f.vat && !f.email ? 0.95 : 0),
    claim: (f) => ({ value: f.vat!, also: [] }),
  },

  website: {
    min: 0.1, proven: true,
    /*
      An email contains a hostname too; it is not the card's web address — and
      the `!f.email` guard catches that while the `@` survives the scan.

      ⚠️ IT DOES NOT SURVIVE RELIABLY. On a real read of the Gmunden card the
      recogniser returned

          jasmin.waltheragmunden.ooe.gv.at

      for `jasmin.walther@gmunden.ooe.gv.at` — the `@` came back as an `a`. With
      no `@` there is no email to guard against, and what is left is shaped
      exactly like a domain, so it won the website role outright. The member saw
      their correspondent's address filed as the company's website, and "nothing
      read" where the email should be.

      A person's name inside a hostname is the giveaway. A company's web address
      is the company's name; `walther.something` on a card belonging to Walther
      is the local part of their email with its `@` lost. Scored down rather than
      refused, so it still wins when the card offers nothing better — a mangled
      address is a poor website but it is not nothing.
    */
    score: (f, c) => {
      if (!f.website || f.email) return 0;
      return looksLikeMangledEmail(f.website, c) ? 0.2 : 0.95;
    },
    claim: (f) => ({ value: f.website!, also: [] }),
  },

  phone: {
    min: 0.1, proven: true,
    score: (f) => {
      if (!f.phone || f.email || f.vat || f.website) return 0;
      /*
        ⚠️ A card carries two or three numbers and the LABEL decides, not the
        order they happen to be printed in. A fax is the one number nobody
        wants dialled; a mobile is usually the one they do.

        A fact holding nothing BUT a fax has no dialable number and scores 0 —
        while `f.phone` stays set, so the line is still ruled out of being read
        as somebody's name. Those are two different questions and they used to
        share one answer.
      */
      if (!f.dial) return 0;
      /*
        ⚠️ The gap between the two labels is deliberately wider than
        `CONTESTED_MARGIN`, and the gap between two UNLABELLED numbers is zero.
        An explicit "M" settles the question; two bare numbers do not, and the
        screen is told so rather than being handed a coin-flip as a fact.
      */
      return cap(0.72 + (f.dial.kind === 'mobile' ? 0.2 : 0) + (f.dial.kind === 'landline' ? 0.06 : 0));
    },
    claim: (f) => ({ value: f.dial!.value, also: [] }),
  },

  company: {
    min: 0.25, proven: false,
    score: (f, c) => {
      // A web address is never the company's NAME, even when the reader could
      // not capture it cleanly enough to fill the website field.
      if (f.email || f.phone || f.website || f.vat || f.urlish) return 0;
      /*
        ⚠️ A job title rules a line out UNLESS it also carries a legal form.
        "Steuerberater Huber GmbH" is a firm whose trade is in its name, and a
        flat "roles are never companies" left it with no company at all.
      */
      if (f.role && !f.legalForm) return 0;
      /*
        ⚠️ And so does a DEPARTMENT, on the same reasoning and for the same
        exception. "Liegenschaftsverwaltung" is what this person does at the
        Stadtamt, not a client to invoice — but "Hausverwaltung Meier GmbH" is a
        firm whose trade is in its name, which is why `department` is already
        false wherever a legal form, the email's domain or an authority word
        says the line names a body rather than a part of one.
      */
      if (f.department) return 0;
      if (f.addressSignal > 0) return 0;
      let s = 0;
      if (f.domainMatch) s += 0.55;
      if (f.legalForm) s += 0.4;
      // A public body has no legal form to print and its name is often the only
      // thing on the card that is not a person or a number.
      if (f.authority) s += 0.3;
      // On a company's card the wordmark is the largest thing there is; on a
      // person's it is their name, and size says nothing about the firm.
      s += f.relSize * (c.kind === 'COMPANY' ? 0.35 : 0.08);
      if (f.wordmark && !f.personShape) s += 0.08;
      /*
        ⚠️ Without this, a card whose domain is the person's own surname
        ("nikiforova.at") offers the PERSON as the company — which is what the
        old email-domain rule did, silently, on a real scan.
      */
      if (f.personShape && !f.legalForm && c.kind === 'PERSON') s -= 0.45;
      return cap(s);
    },
    claim: plain,
  },

  name: {
    min: 0.2, proven: false,
    score: (f, c) => {
      /*
        Hard exclusions, and they are hard for a reason: these are not weak
        evidence against a name, they are proof it is something else.

        ⚠️ `urlish` is checked here and NOT derived from whether the website
        field was filled. That coupling WAS the bug — a website the capture
        pattern missed became a person's name, because nothing else had marked
        the line spoken for.
      */
      if (f.email || f.phone || f.vat || f.website) return 0;
      if (f.urlish || f.hasDigits || f.legalForm || f.role || f.department) return 0;
      if (f.addressSignal > 0) return 0;
      if (f.words > 4 || f.text.length < 4) return 0;

      let s = f.relSize * (c.kind === 'PERSON' ? 0.45 : 0.15);
      if (f.personShape) s += 0.3;
      // The mailbox naming the line is the closest thing to proof a free
      // parser gets: "a.gruber@" beside "Anna Gruber".
      if (f.localMatch) s += 0.3;
      // A name sits at the top of the column it is in, not at the bottom.
      if (f.rowInColumn <= 1) s += 0.08;
      return cap(s);
    },
    claim: plain,
  },

  title: {
    min: 0.5, proven: false,
    score: (f, c) => {
      /*
        ⚠️ A DEPARTMENT is a job title in everything but grammar, and it is the
        answer the product actually wants: it becomes `CustomerContact.role`,
        which is the one place "what does this person do at that firm" can be
        stored. Scored a shade under a real job title, because "Leiter" says
        what somebody DOES and "Liegenschaftsverwaltung" says where they sit.
      */
      if (!f.role && !f.department) return 0;
      if (f.email || f.phone || f.website || f.vat || f.legalForm || f.urlish) return 0;
      let s = f.role ? 0.6 : 0.55;
      // The title sits WITH the name — same column, a line or two away.
      const hint = c.nameHint >= 0 ? c.nameHint : f.i;
      if (Math.abs(f.i - hint) <= 2) s += 0.25;
      return cap(s);
    },
    claim: plain,
  },

  address: {
    min: 0.3, proven: false,
    score: (f) => {
      if (f.email || f.phone || f.website || f.vat) return 0;
      return cap(f.addressSignal);
    },
    /*
      An address is a BLOCK, not a line. Start from the strongest line and grow
      outwards while the neighbours still carry an address signal, in whatever
      order the card printed them — street then postcode, postcode then street,
      or all of it on one line.
    */
    claim: (f, _c, all) => {
      /*
        ⚠️ A SUPPRESSED fact occupies no space here — it is step over, not stop.
        "Rathausplatz 1 ~ 4810 Gmunden" leaves three facts in the array (the
        whole line and its two halves), and the whole line sits between the
        address and whatever is above it. Stopping at it would cut the block to
        one segment; INCLUDING it would print the street twice.
      */
      const reach = (from: number, step: -1 | 1) => {
        let edge = from;
        for (let k = from + step; k >= 0 && k < all.length; k += step) {
          const n = all[k]!;
          if (n.suppressed) continue;
          if (n.addressSignal <= 0 || !sameColumn(n, f)) break;
          edge = k;
        }
        return edge;
      };
      const first = reach(f.i, -1);
      const last = reach(f.i, 1);
      const also: number[] = [];
      const parts: string[] = [];
      for (let k = first; k <= last; k++) {
        if (all[k]!.suppressed) continue;
        parts.push(all[k]!.text);
        if (k !== f.i) also.push(k);
      }
      return { value: tidyAddress(parts.join(', ')), also };
    },
  },
};

/**
 * A separator the recogniser glued to the word before it.
 *
 * The Gmunden card prints `Rathausplatz 1 ~ 4810 Gmunden`; the device returned
 * `Rathausplatz 1_ 4810 Gmunden` — the tilde read as an underscore AND its
 * leading space lost. With no space in front it is rightly not a separator, so
 * the line is not cut and the address is correct — but the glyph is left
 * sitting in the value, and an address is the one field a member reads back
 * character by character when they are standing outside the building.
 *
 * ⚠️ Only where a space FOLLOWS. `Rathausplatz 1_4810` might be a house number
 * a building really uses, and `A-1010` must survive untouched.
 *
 * Address only. The same glyph inside a company name is part of the name, and
 * the point of the whitespace rule everywhere else is that we do not guess.
 */
const GLUED_SEPARATOR = new RegExp('([^\\s])[' + SEPARATOR_GLYPHS + '](\\s)', 'g');
const tidyAddress = (value: string) => value.replace(GLUED_SEPARATOR, '$1,$2').replace(/,\s*,/g, ',');

const sameColumn = (a: LineFacts, b: LineFacts) => a.column === b.column;

const ROLE_ORDER = Object.keys(ROLES) as CardRole[];

// ── Reading the card ────────────────────────────────────────────────────────

/** Normalise, order into columns, and measure every line exactly once. */
function measure(raw: CardLine[]): { facts: LineFacts[]; generic: boolean; personal: boolean; domain?: string; columns: number } {
  const input = (Array.isArray(raw) ? raw : [])
    .filter((l) => l && typeof l.text === 'string')
    .map((l) => ({
      text: clean(l.text),
      /*
        ⚠️ The text as the reader gave it, NOT the cleaned form. `clean`
        collapses runs of whitespace, and a run of two or more spaces is one of
        the separators a card uses — collapsing first destroys the evidence that
        a line held two facts.
      */
      segments: segmentCardLine(l.text),
      y: num(l.y),
      height: num(l.height),
      x: typeof l.x === 'number' && Number.isFinite(l.x) ? l.x : undefined,
      width: typeof l.width === 'number' && Number.isFinite(l.width) ? l.width : undefined,
    }))
    .filter((l) => l.text.length > 1);

  /*
    ⚠️ Columns are clustered over the LINES, never the segments. A segment has
    no geometry of its own — it inherits its line's box, and feeding several
    facts with identical `x` into the clusterer would say nothing it does not
    already know while making the "at least two lines a side" test meaningless.
  */
  const columns = cardColumns(input);
  const order: { index: number; column: number; row: number }[] = [];
  columns.forEach((col, c) => col.forEach((idx, row) => order.push({ index: idx, column: c, row })));

  /*
    A line that split becomes SEVERAL entries: the whole line first, then its
    pieces. Both are measured and scored; `resolveSegments` decides which of
    them was the fact and suppresses the other. A line that did not split
    produces exactly one entry, as before.
  */
  const ordered: (typeof input[number] & {
    column: number; rowInColumn: number; sizeShare: number; pieceOfPrevious?: number;
  })[] = [];
  for (const o of order) {
    const line = input[o.index]!;
    const at = ordered.length;
    ordered.push({ ...line, column: o.column, rowInColumn: o.row, sizeShare: 1 });
    if (line.segments.length < 2) continue;
    for (const piece of line.segments) {
      ordered.push({
        ...line,
        text: piece,
        segments: [piece],
        column: o.column,
        rowInColumn: o.row,
        sizeShare: SEGMENT_SIZE_SHARE,
        pieceOfPrevious: at,
      });
    }
  }

  // The email is needed to measure every other line, so it is found first —
  // as a FACT about the card, not as a claim on a line.
  let email: string | undefined;
  let genericMailbox = false;
  for (const l of ordered) {
    const m = l.text.match(EMAIL);
    if (m) { email = m[0]; break; }
  }
  /*
    The card's domain, from the email — or from the WEB ADDRESS when there is no
    usable email.

    ⚠️ The fallback is not a nicety. The domain is what tells an organisation
    from its department ("which half echoes `gmunden`"), and on a real read of
    the Gmunden card the `@` came back as an `a`, so there was no email, no
    domain, and no company — the department was captured and the authority that
    employs her was not.

    A card almost always prints both, and they almost always agree. Taking the
    web address when the email is missing costs nothing when the email is fine
    and rescues the card when it is not.

    ⚠️ A SOCIAL LINK IS NOT THE CARD'S DOMAIN. `facebook.com` would make every
    company on earth echo "facebook", so the first non-social web address wins.
  */
  let domain = companyDomainFromEmail(email);
  if (!domain) {
    /*
      ⚠️ The FEWEST labels wins, not the first found.

      An email whose `@` was misread is still website-shaped, and on this very
      card it is printed above the web address — so taking the first match made
      `jasmin.waltheragmunden.ooe.gv.at` the card's domain, which echoes nothing
      and left the company empty all over again.

      A company's own web address is the shortest domain on its card:
      `gmunden.at` is two labels, the ruined email is five. Counting labels
      needs no knowledge of the person's name, which `measure` does not have
      yet.
    */
    let fewest = Infinity;
    for (const l of ordered) {
      /*
        ⚠️ Never read the EMAIL line as a web address. An address contains a
        hostname, so `office@gmx.at` offered `gmx.at` as the card's domain —
        a free provider, and the one thing `companyDomainFromEmail` had just
        refused to answer with. Caught by its own test.
      */
      if (EMAIL.test(l.text)) continue;
      const m = l.text.match(WEBSITE);
      if (!m) continue;
      // ⚠️ `m[0]`: WEBSITE is built entirely from non-capturing groups.
      const host = m[0].toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
      if (!host) continue;
      // Keyed on the first label, exactly as `companyDomainFromEmail` reads it.
      const first = host.split('.')[0]!;
      // A free provider names no company, however it reached the card.
      if (SOCIAL_HOST.has(first) || FREE_MAIL_LABEL.has(first)) continue;
      const labels = host.split('.').length;
      if (labels < fewest) { fewest = labels; domain = host; }
    }
  }
  const word = domainWord(domain);
  const { words: locals, personal } = localWords(email);
  if (email && !personal) genericMailbox = true;

  let maxHeight = 0;
  for (const l of ordered) maxHeight = Math.max(maxHeight, l.height);
  const denom = maxHeight > 0 ? maxHeight : 1;

  const facts: LineFacts[] = ordered.map((l, i) => {
    const folded = fold(l.text);
    const squashed = folded.toLowerCase().replace(/[^a-z0-9]/g, '');
    const email$ = l.text.match(EMAIL)?.[0];
    const website$ = email$ ? undefined : l.text.match(WEBSITE)?.[0];
    const vat$ = l.text.match(VAT)?.[1];
    const phones = readCardPhones(l.text);
    const phone$ = phones[0]?.value;

    const street = STREET.test(folded);
    const postcode = POSTCODE.test(l.text);
    const country = COUNTRY.test(folded);
    const house = HOUSE_NUMBER.test(l.text);
    const addressSignal = email$ || phone$ || website$ || vat$
      ? 0
      : Math.min(0.95, (street ? 0.45 : 0) + (postcode ? 0.45 : 0) + (country ? 0.3 : 0) + (street && house ? 0.1 : 0));

    const legalForm = LEGAL_FORM.test(l.text);
    const authority = AUTHORITY.test(folded.toLowerCase());
    const domainMatch = !!word && word.length >= 3 && !email$ && !website$ && squashed.includes(word);

    return {
      i,
      text: l.text,
      folded,
      squashed,
      pieces: undefined,
      partOf: l.pieceOfPrevious,
      suppressed: false,
      y: l.y,
      height: l.height,
      x: l.x,
      width: l.width,
      column: l.column,
      rowInColumn: l.rowInColumn,
      // See SEGMENT_SIZE_SHARE: `sizeShare` is 1 for a whole line.
      relSize: (l.height / denom) * l.sizeShare,
      email: email$,
      website: website$,
      vat: vat$ ? clean(vat$) : undefined,
      phone: phone$,
      phones,
      dial: dialable(phones),
      hasDigits: /\d/.test(l.text),
      words: l.text.split(' ').length,
      legalForm,
      role: isRole(l.text),
      /*
        ⚠️ THE DISCRIMINATOR, and the one thing on this card that actually
        works. "Stadtamt Gmunden" and "Liegenschaftsverwaltung" are the same
        shape to a computer; what tells them apart is that one of them echoes
        the domain the email and the website both point at. A legal form or an
        authority word says the same thing by another route.
      */
      department: DEPARTMENT_STEM.test(folded) && !domainMatch && !legalForm && !authority,
      authority,
      urlish: !!website$ || WWW_PREFIX.test(l.text) || TLD_ANYWHERE.test(l.text) || l.text.includes('://'),
      personShape: isPersonShape(l.text),
      wordmark: isWordmark(l.text),
      addressSignal,
      domainMatch: !!word && word.length >= 3 && !email$ && !website$ && squashed.includes(word),
      localMatch: locals.length > 0 && !email$ && locals.some((w) => squashed.includes(w)),
    };
  });

  // The pieces point at their line; the line is told which pieces are its own.
  for (const f of facts) {
    if (f.partOf === undefined) continue;
    const parent = facts[f.partOf];
    if (!parent) continue;
    (parent.pieces ??= []).push(f.i);
  }

  return { facts, generic: genericMailbox, personal, domain, columns: columns.length };
}

/**
 * WAS THE SEPARATOR DECORATION, OR PART OF THE VALUE?
 *
 * Answered once, from the scores, because it cannot be answered from the text.
 * "Stadtamt Gmunden ~ Liegenschaftsverwaltung" and "Müller | Söhne GmbH" are
 * the same shape; what differs is that the first has TWO halves that mean
 * something on their own and the second has one.
 *
 * So: a line is suppressed in favour of its pieces when at least two of those
 * pieces cleared a role's floor. Otherwise the pieces are suppressed and the
 * whole line stands — which is the promise that splitting never loses a value,
 * enforced here rather than hoped for.
 *
 * Mutates `suppressed` on the facts (the address block reads it) and returns
 * the set so the candidate lists can be filtered with it.
 */
function resolveSegments(facts: LineFacts[], perRole: Record<CardRole, CardCandidate[]>): Set<number> {
  const claiming = new Set<number>();
  for (const role of ROLE_ORDER) for (const c of perRole[role]!) claiming.add(c.sourceIndex);

  const suppressed = new Set<number>();
  for (const f of facts) {
    if (!f.pieces?.length) continue;
    const meaningful = f.pieces.filter((i) => claiming.has(i));
    const losers = meaningful.length >= 2 ? [f.i] : f.pieces;
    for (const i of losers) {
      suppressed.add(i);
      facts[i]!.suppressed = true;
    }
  }
  return suppressed;
}

const withoutSuppressed = (
  perRole: Record<CardRole, CardCandidate[]>,
  suppressed: Set<number>,
): Record<CardRole, CardCandidate[]> => {
  if (suppressed.size === 0) return perRole;
  const out = {} as Record<CardRole, CardCandidate[]>;
  for (const role of ROLE_ORDER) out[role] = perRole[role]!.filter((c) => !suppressed.has(c.sourceIndex));
  return out;
};

/**
 * Every line scored for every role, best first.
 *
 * Exported because it is the part worth inspecting when a card reads wrong:
 * the answer is always "look at what each line scored", and that should not
 * require re-running the whole parse in your head.
 *
 * ⚠️ Segments are resolved here too, so this and `parseBusinessCard` cannot
 * disagree about what was on offer. An inspector that showed candidates the
 * parse had already ruled out would send somebody looking in the wrong place.
 */
export function scoreCardLines(raw: CardLine[]): Record<CardRole, CardCandidate[]> {
  const { facts, generic, personal } = measure(raw);
  const ctx = contextFor(facts, generic, personal);
  const out = {} as Record<CardRole, CardCandidate[]>;
  for (const role of ROLE_ORDER) out[role] = candidatesFor(role, facts, ctx);
  return withoutSuppressed(out, resolveSegments(facts, out));
}

function contextFor(facts: LineFacts[], generic: boolean, personal: boolean): Ctx {
  const kind = kindFromFacts(facts, generic, personal).kind;
  /*
    A provisional name, used ONLY as context for "the title sits beside the
    name". It is not an assignment and nothing is marked used by it — the real
    choice still happens in the one place, below.
  */
  const base: Ctx = { kind, nameHint: -1 };
  let best = -1;
  let bestScore = 0;
  for (const f of facts) {
    const s = ROLES.name.score(f, base);
    if (s > bestScore) { bestScore = s; best = f.i; }
  }
  return { kind, nameHint: best, nameText: facts.find((f) => f.i === best)?.text };
}

/**
 * Is this "website" a person's email address with its `@` lost?
 *
 * A company's web address is the company's name. A hostname carrying the
 * cardholder's OWN name is the local part of their email, run into the domain
 * by a recogniser that read the `@` as a letter — `jasmin.walther@gmunden…`
 * coming back as `jasmin.waltheragmunden…`.
 *
 * ⚠️ Compared against the name's WORDS, each at least four letters. Shorter and
 * common surnames collide with ordinary domains, and "Ho" or "Li" appears
 * inside half the hostnames on earth.
 */
function looksLikeMangledEmail(website: string, ctx: Ctx): boolean {
  if (!ctx.nameText) return false;
  const host = website.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  return ctx.nameText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4)
    .some((w) => host.includes(w));
}

function candidatesFor(role: CardRole, facts: LineFacts[], ctx: Ctx): CardCandidate[] {
  const spec = ROLES[role];
  const found: CardCandidate[] = [];
  for (const f of facts) {
    const s = spec.score(f, ctx);
    if (s >= spec.min) found.push({ sourceIndex: f.i, value: f.text, score: Math.round(s * 100) / 100 });
  }
  return found.sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex);
}

/** The top two are close enough that the reader is choosing, not reading. */
const CONTESTED_MARGIN = 0.1;
/** A runner-up worth offering: near the winner, not merely non-zero. */
const ALTERNATIVE_SHARE = 0.4;
const MAX_ALTERNATIVES = 3;

/**
 * A company name recovered from whichever domain the card points at.
 *
 * The email's domain first — it names an employer — and the website's host
 * second, because a card can print an address and no email at all.
 *
 * ⚠️ Silent when the domain is the PERSON'S OWN NAME. A sole practitioner's
 * site is `nikiforova.at`, and "Nikiforova" offered as the firm she works for
 * is the same mistake `company` already refuses to make (see the `personShape`
 * penalty there) — made again, in a field that exists to be accepted with one
 * tap.
 */
function suggestCompany(
  /** The line the parse settled on as the person's name — nothing else. */
  named: LineFacts | undefined,
  kind: CardKind,
  domain?: string,
  website?: string,
): string | undefined {
  const host = domain ?? websiteHost(website);
  if (!host) return undefined;
  /*
    ⚠️ Asked of the NAME the parse actually chose, not of every person-shaped
    line on the card. "Stadtamt Gmunden" is two capitalised words and therefore
    person-shaped to the same test a person's name passes — asking the question
    of all of them withheld the suggestion on the very card it was built for.

    And asked of the HOST rather than of `domainMatch`, which is derived from
    the email alone: a card can carry a website and no address at all, and that
    is exactly the card a sole practitioner hands over.
  */
  const label = domainWord(host);
  if (kind === 'PERSON' && label && label.length >= 3 && named?.squashed.includes(label)) return undefined;
  return companyNameFromDomain(host);
}

export function parseBusinessCard(raw: CardLine[]): ParsedCard {
  /*
    ⚠️ Nothing in here may throw. It is handed whatever a camera and a text
    recogniser made of a photograph, on a screen the person is waiting on, and
    a half-read card is worth more than a crash. Returning the lines alone is
    still a usable result: the screen lets any field pick from them.
  */
  let lines: string[] = [];
  try {
    const { facts, generic, personal, domain, columns } = measure(raw);
    /*
      ⚠️ EVERY fact, the glued line AND its pieces, whichever of them the
      resolver went on to suppress.

      `lines` is what the review screen offers under "Pick a different line",
      and it is the only way back from a wrong answer. A line the parse decided
      against is exactly the line somebody may want: dropping the pieces hides
      "Liegenschaftsverwaltung" on a card that printed it, and dropping the
      whole line hides "TEC | Anlagenbau GmbH" from the one person who knows
      that is the firm's real name. Nothing the card said stops being pickable.
    */
    lines = facts.map((f) => f.text);
    const kind = kindFromFacts(facts, generic, personal);
    const ctx = contextFor(facts, generic, personal);

    const fields: Partial<Record<CardRole, CardField>> = {};

    // Every (line, role) pair that clears its floor, best first.
    const scored = {} as Record<CardRole, CardCandidate[]>;
    for (const role of ROLE_ORDER) scored[role] = candidatesFor(role, facts, ctx);
    /*
      ⚠️ BEFORE anything is assigned. A line and its pieces are rivals for the
      same fact, and letting both into the auction gives one card two companies
      — the glued line winning `company` while its own half wins nothing, or
      worse, an address block printing the street once as a line and again as a
      piece. Decided here, once, and from the scores, which is the only place
      the evidence exists.
    */
    const perRole = withoutSuppressed(scored, resolveSegments(facts, scored));

    const pairs: { role: CardRole; i: number; score: number }[] = [];
    for (const role of ROLE_ORDER) {
      for (const c of perRole[role]!) pairs.push({ role, i: c.sourceIndex, score: c.score });
    }
    /*
      ⚠️ THE FIX FOR "whichever rule ran first owns the line".

      Assignment is by STRENGTH, not by the order the fields happen to be
      declared in. A line that is obviously a website is spoken for before
      anything is desperate enough to call it a name, and — the half that
      actually bit — a website the capture pattern MISSED still cannot become a
      name, because it never scored as one in the first place.

      Ties fall back to the declared order and then to position, so the same
      card always reads the same way.
    */
    pairs.sort((a, b) =>
      b.score - a.score ||
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
      a.i - b.i);

    const claimed = new Set<number>();
    const filled = new Set<CardRole>();
    for (const p of pairs) {
      if (filled.has(p.role) || claimed.has(p.i)) continue;
      const spec = ROLES[p.role];
      const f = facts[p.i]!;
      const { value, also } = spec.claim(f, ctx, facts);
      /*
        ⚠️ A line the winner SWALLOWED is not an alternative to it. The address
        block takes two or three lines, and offering "4020 Linz" as the other
        thing the address might have been invites somebody to replace a whole
        address with half of it.
      */
      const rest = perRole[p.role]!.filter((c) => c.sourceIndex !== p.i && !also.includes(c.sourceIndex));
      const runnerUp = rest[0];
      fields[p.role] = {
        value,
        confidence: spec.proven ? 'certain' : 'likely',
        sourceIndex: p.i,
        score: p.score,
        alternatives: rest
          .filter((c) => c.score >= p.score * ALTERNATIVE_SHARE)
          .slice(0, MAX_ALTERNATIVES),
        // The epsilon is not fussiness: 0.92 − 0.82 is 0.1000000000000001 in
        // binary floating point, and a margin test that excluded exactly that
        // case would exclude the commonest one.
        contested: !!runnerUp && p.score - runnerUp.score <= CONTESTED_MARGIN + 1e-9,
      };
      filled.add(p.role);
      claimed.add(p.i);
      for (const j of also) claimed.add(j);
    }

    /*
      EVERY number the card printed, in reading order, deduped by its digits —
      a card that prints the switchboard twice is one number, and the two
      spellings of it are not a choice worth offering.
    */
    const phones: CardPhone[] = [];
    const seen = new Set<string>();
    for (const f of facts) {
      if (f.suppressed) continue;
      for (const p of f.phones) {
        const key = p.value.replace(/\D/g, '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        phones.push({ ...p, sourceIndex: f.i });
      }
    }

    return {
      lines,
      kind,
      columns,
      companyDomain: domain,
      companySuggestion: suggestCompany(
        fields.name ? facts[fields.name.sourceIndex] : undefined,
        kind.kind,
        domain,
        fields.website?.value,
      ),
      ...(phones.length ? { phones } : {}),
      ...fields,
    };
  } catch {
    return { lines, kind: { kind: 'PERSON', confidence: 0, reasons: ['default-person'] }, columns: 1 };
  }
}


/** A line as an OCR engine reports it: text plus a box in IMAGE PIXELS. */
export interface OcrLine {
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

/** A region of the image, in fractions of it — what `frameToImageCrop` returns. */
export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Pixels → fractions of the CARD.
 *
 * ⚠️ Getting this wrong does not throw. It quietly makes every line the same
 * "size", which removes the strongest signal the rules have and turns name
 * detection into a coin flip. It lives here, next to the rules that depend on
 * it, rather than in the screen that happens to call the camera.
 *
 * ⚠️ `crop` is not an optimisation. The photograph is the whole frame — a desk,
 * a poster, whatever is behind the card — and every word of that reaches the
 * reader. Two things go wrong without it: background text competes to be the
 * company, and heights are measured against the PHOTO rather than the card, so
 * "the largest line" stops meaning "the largest line on the card". Keeping only
 * what was inside the frame the person aimed, and re-measuring against that
 * frame, fixes both — and costs nothing, because the reader has already done
 * the work.
 *
 * ⚠️ It reports `x` and `width` as well, and that is the whole of what makes
 * columns possible. They used to be computed here and thrown away one line
 * later, so a card with the firm down one side and the person down the other
 * arrived as interleaved lines in an order nothing could reason about.
 *
 * Also sorts into reading order: ML Kit groups by block, and blocks do not
 * arrive top-to-bottom.
 */
/**
 * Is the writing on its side?
 *
 * A line of horizontal text makes a wide, short box; give the card a quarter
 * turn and every box becomes tall and narrow, because a bounding box stays
 * axis-aligned however the text runs. So the SHAPE of the boxes, taken
 * together, tells us which way the card is lying — no engine has to report an
 * angle, which matters because the reader we bind to reports only a rectangle.
 *
 * ⚠️ Measured in PIXELS, never in the normalised fractions used below. Dividing
 * width by the image width and height by the image height stretches every box
 * by the image's own aspect, so on a 4:3 photograph a perfectly square box
 * comes out "tall" and a page of ordinary text can read as rotated.
 *
 * ⚠️ Decided over the card as a whole, never per line. "GmbH" set small is
 * nearly square, and a single stacked word — a logo, a vertical rule — must not
 * be able to turn the rest of the card on its side. Lines with no clear shape
 * abstain rather than vote.
 */
function readsSideways(lines: OcrLine[]): boolean {
  const decisive = lines.filter((l) => {
    if (l.text.trim().length < 3) return false;
    const { width, height } = l.boundingBox;
    if (width <= 0 || height <= 0) return false;
    return width > height * 1.5 || height > width * 1.5;
  });
  // Two lines is the least that can be a majority of anything.
  if (decisive.length < 2) return false;
  const tall = decisive.filter((l) => l.boundingBox.height > l.boundingBox.width).length;
  return tall * 2 > decisive.length;
}

export function toCardLines(
  blocks: { lines: OcrLine[] }[],
  imageHeight: number,
  crop?: CropRect,
  imageWidth?: number,
): CardLine[] {
  const h = imageHeight > 0 ? imageHeight : 1;
  const w = imageWidth && imageWidth > 0 ? imageWidth : 1;

  const raw = blocks.flatMap((b) => b.lines);

  /*
    A portrait-format card laid in a landscape frame is not an edge case — it
    is a whole style of card, and the person holding the phone has no way to
    tell us. Reading the geometry means the same rules work either way up.
  */
  const sideways = readsSideways(raw);

  /*
    Which way the rules should look.

    `y` in a CardLine means "how far down the card" and `height` means "how big
    the type is"; `x` and `width` mean "how far ACROSS" and "how wide", which is
    what the column clusterer reads. When the card is on its side those live on
    the other axis, so the two pairs are simply swapped. Everything downstream
    is unchanged, and cannot tell the difference.
  */
  const along = (l: { x: number; y: number }) => (sideways ? l.x : l.y);
  const size = (l: { width: number; height: number }) => (sideways ? l.width : l.height);
  const across = (l: { x: number; y: number }) => (sideways ? l.y : l.x);
  const breadth = (l: { width: number; height: number }) => (sideways ? l.height : l.width);

  const all = raw.map((l) => ({
    text: l.text,
    // Fractions of the whole image first; the crop is expressed the same way.
    x: l.boundingBox.x / w,
    y: l.boundingBox.y / h,
    width: l.boundingBox.width / w,
    height: l.boundingBox.height / h,
  }));

  if (!crop || crop.width <= 0 || crop.height <= 0) {
    return all
      .map((l) => ({ text: l.text, y: along(l), height: size(l), x: across(l), width: breadth(l) }))
      .sort((a, b) => a.y - b.y);
  }

  const right = crop.left + crop.width;
  const bottom = crop.top + crop.height;
  // The card's own extent along whichever axis the writing runs down, and
  // across whichever axis the columns run.
  const start = sideways ? crop.left : crop.top;
  const span = sideways ? crop.width : crop.height;
  const crossStart = sideways ? crop.top : crop.left;
  const crossSpan = sideways ? crop.height : crop.width;

  return all
    // A line belongs to the card if its CENTRE is inside the frame. Judging by
    // the whole box would drop anything the frame clips by a pixel, which is
    // most of a card held to fill it.
    .filter((l) => {
      const cx = l.x + l.width / 2;
      const cy = l.y + l.height / 2;
      return cx >= crop.left && cx <= right && cy >= crop.top && cy <= bottom;
    })
    // Re-measured against the CARD, so height means what the rules assume.
    .map((l) => ({
      text: l.text,
      y: (along(l) - start) / span,
      height: size(l) / span,
      x: (across(l) - crossStart) / crossSpan,
      width: breadth(l) / crossSpan,
    }))
    .sort((a, b) => a.y - b.y);
}
