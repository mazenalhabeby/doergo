/** What a line IS, measured once: person shape, wordmark, company domain/name. */
import { TLD } from './patterns-contact';
import { FREE_MAIL_LABEL, GENERIC_LOCAL, HONORIFIC, fold } from './patterns-words';
import type { CardKind, CardPhoneKind } from './types';

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

export { LineFacts, Ctx, isPersonShape, hasHonorific, isWordmark, SOCIAL_HOST, websiteHost, domainWord, localWords };
