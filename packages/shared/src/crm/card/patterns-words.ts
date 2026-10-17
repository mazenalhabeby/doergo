/** Word lists: legal forms, roles, departments, authorities, addresses, honorifics. */
import { stripDiacritics } from '../../utils/fold';

/** Suffixes that mark a line as an organisation rather than a person. */
const LEGAL_FORM = /\b(gmbh|ag|ges\.?m\.?b\.?h|kg|og|e\.?u\.?|ltd|limited|inc|llc|plc|s\.?r\.?o|sp\.?\s?z\.?o\.?o|bv|nv|sa|srl|spa|oy|ab|a\/s|aps)\b/i;

/** Does this text carry a legal form ("GmbH", "AG", "Ltd")? The card reader's rule, for the contacts import too. */
export function hasLegalForm(text: string): boolean {
  return LEGAL_FORM.test(text);
}

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
const fold = stripDiacritics;

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
const POSTCODE =
  /(?:(?:^|[^\d+])\d{4,5}\s+[A-Za-zÄÖÜäöüß]|\b[A-Z]{1,2}-\d{4,5}\b|\b\d{4}\s?[A-Z]{2}\b|\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b)/;

const COUNTRY =
  /\b(austria|osterreich|germany|deutschland|switzerland|schweiz|suisse|italy|italia|italien|france|frankreich|spain|espana|spanien|netherlands|nederland|niederlande|belgium|belgien|czechia|cesko|tschechien|slovakia|slovensko|hungary|ungarn|poland|polska|polen|slovenia|slovenija|croatia|hrvatska|united kingdom|great britain|england|scotland|wales|ireland|usa|united states)\b/i;

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

export {
  LEGAL_FORM,
  fold,
  isRole,
  DEPARTMENT_STEM,
  AUTHORITY,
  STREET,
  HOUSE_NUMBER,
  POSTCODE,
  COUNTRY,
  HONORIFIC,
  GENERIC_LOCAL,
  FREE_MAIL_LABEL,
  MAX_LINE_CHARS,
  clean,
  num,
};
