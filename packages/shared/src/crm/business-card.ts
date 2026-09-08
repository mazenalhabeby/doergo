/**
 * Reading a business card, with no service and no model.
 *
 * The OCR step — Apple Vision on iOS, ML Kit on Android — hands back LINES,
 * not a customer. Every line arrives with a box and a height, and that
 * geometry carries most of the meaning on a card: the name is set large near
 * the top, the contact details are small and clustered at the bottom.
 *
 * This file is the whole "intelligence", and it is deliberately plain rules
 * anybody can read, argue with and test. It runs on the phone, offline, and
 * costs nothing per scan.
 *
 * ⚠️ It is NOT allowed to be silently wrong. Fields it can prove — email,
 * phone, website, VAT — are returned as `certain`. Fields it infers — name,
 * company, title, address — are returned as `likely`, and the screen shows
 * that difference so nothing is saved on a guess nobody saw.
 */

/** One line of recognised text, as every OCR engine can supply it. */
export interface CardLine {
  text: string;
  /** Normalised 0–1 within the cropped card, so engines and resolutions agree. */
  y: number;
  /** Line height, normalised the same way. The name is usually the tallest. */
  height: number;
}

export type FieldConfidence = 'certain' | 'likely';

export interface CardField {
  value: string;
  confidence: FieldConfidence;
  /** Which line it came from, so the screen can offer the alternatives. */
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
}

// ── Shapes that prove themselves ────────────────────────────────────────────
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// Deliberately loose on separators and strict on length: a card writes a number
// a dozen ways, but seven digits is the floor for a real one.
const PHONE = /(\+?\d[\d\s().\-/]{6,}\d)/;
const WEBSITE = /((?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|net|org|io|at|de|ch|eu|co\.uk|cz|sk|hu|it|fr|es)(?:\/\S*)?)/i;
const VAT = /\b((?:ATU|DE|CHE|IT|FR|ESB|CZ|SK|HU)[\s-]?\d[\d\s-]{6,})\b/i;

/** A number labelled as a mobile beats one labelled fax, whatever the order. */
const PHONE_LABEL = /\b(tel|phone|mobile|mob|cell|m|t)\b[.:]?/i;
const FAX_LABEL = /\bfax\b/i;

/** Suffixes that mark a line as an organisation rather than a person. */
const LEGAL_FORM = /\b(gmbh|ag|ges\.?m\.?b\.?h|kg|og|e\.?u\.?|ltd|limited|inc|llc|plc|s\.?r\.?o|sp\.?\s?z\.?o\.?o|bv|nv|sa|srl|spa|oy|ab|a\/s|aps)\b/i;

/** Words that mark a line as a job title, in the languages this product ships. */
const ROLE = /\b(head|chief|director|manager|lead|leiter|leitung|geschäftsführ|prokurist|inhaber|owner|founder|ceo|cto|cfo|coo|president|vp|vice|senior|junior|engineer|ingenieur|techniker|sales|vertrieb|einkauf|purchas|account|consultant|berater|assistant|assistenz|coordinator|koordinator|supervisor|meister|partner|architekt|projekt|project)\b/i;

/** A postcode next to a town: the giveaway that a line is an address. */
const POSTCODE = /\b(\d{4,5})\s+[A-Za-zÄÖÜäöüß]/;
const STREET = /\b(stra(ss|ß)e|str\.|gasse|weg|platz|allee|ring|road|street|st\.|ave|avenue|lane)\b/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function findLine(lines: CardLine[], re: RegExp, skip?: (t: string) => boolean): { i: number; m: RegExpMatchArray } | null {
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.text;
    if (skip?.(t)) continue;
    const m = t.match(re);
    if (m) return { i, m };
  }
  return null;
}

/**
 * The strongest free signal on a card: the email's domain names the company.
 *
 * `a.gruber@siemens.com` → the line containing "siemens" IS the company, in
 * whatever form the card writes it ("Siemens AG"). No vocabulary, no model,
 * and it works in any language — which is why this is tried before anything
 * else.
 */
function companyFromEmail(lines: CardLine[], email?: string): number {
  if (!email) return -1;
  const domain = email.split('@')[1]?.split('.')[0]?.toLowerCase();
  // Generic mailbox hosts name a provider, not an employer.
  const GENERIC = ['gmail', 'outlook', 'hotmail', 'yahoo', 'gmx', 'web', 'icloud', 'aol', 'proton', 'me'];
  if (!domain || domain.length < 3 || GENERIC.includes(domain)) return -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.text.toLowerCase();
    if (t.includes('@') || t.includes('www.')) continue;
    if (t.replace(/[^a-z0-9]/g, '').includes(domain)) return i;
  }
  return -1;
}

export function parseBusinessCard(raw: CardLine[]): ParsedCard {
  const lines = raw
    .map((l) => ({ ...l, text: clean(l.text) }))
    .filter((l) => l.text.length > 1);
  const out: ParsedCard = { lines: lines.map((l) => l.text) };
  const used = new Set<number>();

  const take = (i: number, value: string, confidence: FieldConfidence): CardField => {
    used.add(i);
    return { value, confidence, sourceIndex: i };
  };

  // ── The provable ones ─────────────────────────────────────────────────────
  const email = findLine(lines, EMAIL);
  if (email) out.email = take(email.i, email.m[0]!.toLowerCase(), 'certain');

  const vat = findLine(lines, VAT);
  if (vat) out.vat = take(vat.i, clean(vat.m[1]!), 'certain');

  /*
    Phones: a card often carries two or three. A labelled mobile is what a
    person wants dialled, and a fax is what they do not — so the label decides
    rather than the order they happen to be printed in.
  */
  const phoneCandidates = lines
    .map((l, i) => ({ i, t: l.text, m: l.text.match(PHONE) }))
    .filter((c) => c.m && !FAX_LABEL.test(c.t) && !EMAIL.test(c.t) && !VAT.test(c.t));
  const preferred = phoneCandidates.find((c) => PHONE_LABEL.test(c.t)) ?? phoneCandidates[0];
  if (preferred) out.phone = take(preferred.i, clean(preferred.m![1]!), 'certain');

  const site = findLine(lines, WEBSITE, (t) => EMAIL.test(t));
  if (site) out.website = take(site.i, clean(site.m[1]!), 'certain');

  // ── The inferred ones ─────────────────────────────────────────────────────
  const byEmail = companyFromEmail(lines, out.email?.value);
  if (byEmail >= 0) {
    out.company = take(byEmail, lines[byEmail]!.text, 'likely');
  } else {
    const legal = findLine(lines, LEGAL_FORM, (t) => EMAIL.test(t) || WEBSITE.test(t));
    if (legal) out.company = take(legal.i, lines[legal.i]!.text, 'likely');
  }

  /*
    The name: the biggest thing on the card that is not the company.

    Type size is the designer telling you what matters, and on a business card
    the answer is almost always the person. Digits and "@" rule a line out; so
    does a legal form, because that is the company however large it is set.
  */
  const nameCandidates = lines
    .map((l, i) => ({ i, l }))
    .filter(({ i, l }) =>
      !used.has(i) &&
      !/\d/.test(l.text) &&
      !l.text.includes('@') &&
      !LEGAL_FORM.test(l.text) &&
      !ROLE.test(l.text) &&
      l.text.split(' ').length <= 4 &&
      l.text.length >= 4)
    .sort((a, b) => (b.l.height - a.l.height) || (a.l.y - b.l.y));
  if (nameCandidates[0]) {
    out.name = take(nameCandidates[0].i, nameCandidates[0].l.text, 'likely');
  }

  // The title sits with the name — usually the line right after it.
  const roleLine = lines
    .map((l, i) => ({ i, l }))
    .filter(({ i, l }) => !used.has(i) && ROLE.test(l.text))
    .sort((a, b) => {
      const n = out.name?.sourceIndex ?? 0;
      return Math.abs(a.i - n) - Math.abs(b.i - n);
    })[0];
  if (roleLine) out.title = take(roleLine.i, roleLine.l.text, 'likely');

  // An address is a postcode line, joined to the street line above it.
  const postal = lines.map((l, i) => ({ i, l })).find(({ i, l }) => !used.has(i) && POSTCODE.test(l.text));
  if (postal) {
    const above = lines[postal.i - 1];
    const street = above && !used.has(postal.i - 1) && STREET.test(above.text) ? above.text + ', ' : '';
    if (street) used.add(postal.i - 1);
    out.address = take(postal.i, street + postal.l.text, 'likely');
  }

  return out;
}


/** A line as an OCR engine reports it: text plus a box in IMAGE PIXELS. */
export interface OcrLine {
  text: string;
  boundingBox: { y: number; height: number };
}

/**
 * Pixels → fractions of the card.
 *
 * ⚠️ Getting this wrong does not throw. It quietly makes every line the same
 * "size", which removes the strongest signal the rules have and turns name
 * detection into a coin flip. It lives here, next to the rules that depend on
 * it, rather than in the screen that happens to call the camera.
 *
 * Also sorts into reading order: ML Kit groups by block, and blocks do not
 * arrive top-to-bottom.
 */
export function toCardLines(
  blocks: { lines: OcrLine[] }[],
  imageHeight: number,
): CardLine[] {
  const h = imageHeight > 0 ? imageHeight : 1;
  return blocks
    .flatMap((b) => b.lines)
    .map((l) => ({ text: l.text, y: l.boundingBox.y / h, height: l.boundingBox.height / h }))
    .sort((a, b) => a.y - b.y);
}
