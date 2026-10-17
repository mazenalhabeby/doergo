/** Shapes that prove themselves: e-mail, phone, VAT, website, phone labels, separators. */
import type { CardPhoneKind } from './types';

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

export {
  EMAIL,
  PHONE_SCAN,
  VAT,
  TLD,
  WEBSITE,
  WWW_PREFIX,
  TLD_ANYWHERE,
  PHONE_LABEL,
  LABEL_KIND,
  SEPARATOR_GLYPHS,
  CARD_SEPARATOR,
  SEPARATOR_EDGE,
  MAX_SEGMENTS,
  MAX_PHONES_PER_LINE,
  SEGMENT_SIZE_SHARE,
};
