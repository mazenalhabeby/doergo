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

/** A number labelled as a mobile beats one labelled fax, whatever the order. */
const MOBILE_LABEL = /\b(mobile|mobil|mob|cell|handy|m)\b[.:]?/i;
const TEL_LABEL = /\b(tel|telefon|telephone|phone|t|festnetz|office)\b[.:]?/i;
const FAX_LABEL = /\bfax\b/i;

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

  email?: string;
  phone?: string;
  website?: string;
  vat?: string;

  hasDigits: boolean;
  words: number;
  legalForm: boolean;
  role: boolean;
  mobileLabel: boolean;
  telLabel: boolean;
  fax: boolean;
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
    // An email contains a hostname too; it is not the card's web address.
    score: (f) => (f.website && !f.email ? 0.95 : 0),
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
      */
      if (f.fax) return 0;
      /*
        ⚠️ The gap between the two labels is deliberately wider than
        `CONTESTED_MARGIN`, and the gap between two UNLABELLED numbers is zero.
        An explicit "M" settles the question; two bare numbers do not, and the
        screen is told so rather than being handed a coin-flip as a fact.
      */
      return cap(0.72 + (f.mobileLabel ? 0.2 : 0) + (f.telLabel ? 0.06 : 0));
    },
    claim: (f) => ({ value: f.phone!, also: [] }),
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
      if (f.addressSignal > 0) return 0;
      let s = 0;
      if (f.domainMatch) s += 0.55;
      if (f.legalForm) s += 0.4;
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
      if (f.urlish || f.hasDigits || f.legalForm || f.role) return 0;
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
      if (!f.role) return 0;
      if (f.email || f.phone || f.website || f.vat || f.legalForm || f.urlish) return 0;
      let s = 0.6;
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
      const also: number[] = [];
      let first = f.i;
      let last = f.i;
      while (first > 0 && all[first - 1]!.addressSignal > 0 && sameColumn(all[first - 1]!, f)) first--;
      while (last < all.length - 1 && all[last + 1]!.addressSignal > 0 && sameColumn(all[last + 1]!, f)) last++;
      const parts: string[] = [];
      for (let k = first; k <= last; k++) {
        parts.push(all[k]!.text);
        if (k !== f.i) also.push(k);
      }
      return { value: parts.join(', '), also };
    },
  },
};

const sameColumn = (a: LineFacts, b: LineFacts) => a.column === b.column;

const ROLE_ORDER = Object.keys(ROLES) as CardRole[];

// ── Reading the card ────────────────────────────────────────────────────────

/** Normalise, order into columns, and measure every line exactly once. */
function measure(raw: CardLine[]): { facts: LineFacts[]; generic: boolean; personal: boolean; domain?: string; columns: number } {
  const input = (Array.isArray(raw) ? raw : [])
    .filter((l) => l && typeof l.text === 'string')
    .map((l) => ({
      text: clean(l.text),
      y: num(l.y),
      height: num(l.height),
      x: typeof l.x === 'number' && Number.isFinite(l.x) ? l.x : undefined,
      width: typeof l.width === 'number' && Number.isFinite(l.width) ? l.width : undefined,
    }))
    .filter((l) => l.text.length > 1);

  const columns = cardColumns(input);
  const order: { index: number; column: number; row: number }[] = [];
  columns.forEach((col, c) => col.forEach((idx, row) => order.push({ index: idx, column: c, row })));

  const ordered = order.map((o) => ({ ...input[o.index]!, column: o.column, rowInColumn: o.row }));

  // The email is needed to measure every other line, so it is found first —
  // as a FACT about the card, not as a claim on a line.
  let email: string | undefined;
  let genericMailbox = false;
  for (const l of ordered) {
    const m = l.text.match(EMAIL);
    if (m) { email = m[0]; break; }
  }
  const domain = companyDomainFromEmail(email);
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
    const phone$ = l.text.match(PHONE)?.[0];

    const street = STREET.test(folded);
    const postcode = POSTCODE.test(l.text);
    const country = COUNTRY.test(folded);
    const house = HOUSE_NUMBER.test(l.text);
    const addressSignal = email$ || phone$ || website$ || vat$
      ? 0
      : Math.min(0.95, (street ? 0.45 : 0) + (postcode ? 0.45 : 0) + (country ? 0.3 : 0) + (street && house ? 0.1 : 0));

    return {
      i,
      text: l.text,
      folded,
      squashed,
      y: l.y,
      height: l.height,
      x: l.x,
      width: l.width,
      column: l.column,
      rowInColumn: l.rowInColumn,
      relSize: l.height / denom,
      email: email$,
      website: website$,
      vat: vat$ ? clean(vat$) : undefined,
      phone: phone$ ? clean(phone$) : undefined,
      hasDigits: /\d/.test(l.text),
      words: l.text.split(' ').length,
      legalForm: LEGAL_FORM.test(l.text),
      role: isRole(l.text),
      mobileLabel: MOBILE_LABEL.test(l.text),
      telLabel: TEL_LABEL.test(l.text),
      fax: FAX_LABEL.test(l.text),
      urlish: !!website$ || WWW_PREFIX.test(l.text) || TLD_ANYWHERE.test(l.text) || l.text.includes('://'),
      personShape: isPersonShape(l.text),
      wordmark: isWordmark(l.text),
      addressSignal,
      domainMatch: !!word && word.length >= 3 && !email$ && !website$ && squashed.includes(word),
      localMatch: locals.length > 0 && !email$ && locals.some((w) => squashed.includes(w)),
    };
  });

  return { facts, generic: genericMailbox, personal, domain, columns: columns.length };
}

/**
 * Every line scored for every role, best first.
 *
 * Exported because it is the part worth inspecting when a card reads wrong:
 * the answer is always "look at what each line scored", and that should not
 * require re-running the whole parse in your head.
 */
export function scoreCardLines(raw: CardLine[]): Record<CardRole, CardCandidate[]> {
  const { facts, generic, personal } = measure(raw);
  const ctx = contextFor(facts, generic, personal);
  const out = {} as Record<CardRole, CardCandidate[]>;
  for (const role of ROLE_ORDER) out[role] = candidatesFor(role, facts, ctx);
  return out;
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
  return { kind, nameHint: best };
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
    lines = facts.map((f) => f.text);
    const kind = kindFromFacts(facts, generic, personal);
    const ctx = contextFor(facts, generic, personal);

    const fields: Partial<Record<CardRole, CardField>> = {};

    // Every (line, role) pair that clears its floor, best first.
    const perRole = {} as Record<CardRole, CardCandidate[]>;
    const pairs: { role: CardRole; i: number; score: number }[] = [];
    for (const role of ROLE_ORDER) {
      const found = candidatesFor(role, facts, ctx);
      perRole[role] = found;
      for (const c of found) pairs.push({ role, i: c.sourceIndex, score: c.score });
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

    return { lines, kind, columns, companyDomain: domain, ...fields };
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
