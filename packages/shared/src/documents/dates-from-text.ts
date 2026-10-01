/**
 * Dates read off a document that has no machine-readable zone.
 *
 * Passports and ID cards carry an MRZ, so their expiry is read exactly and
 * proved by a check digit. NOTHING ELSE DOES. A European driving licence has no
 * MRZ at all, and neither does a gas certificate or a first-aid card — so for
 * those, the only thing available is the printed text, and the only honest
 * status for anything found there is A SUGGESTION.
 *
 * That distinction runs through the whole module. An MRZ expiry is a fact the
 * document proves about itself; a date scraped from printed text is a guess
 * good enough to save somebody typing, and it is offered for confirmation, never
 * filed as read.
 *
 * The guess is better than it sounds for the documents this product files. An
 * EU driving licence prints exactly three dates in numbered fields — 3 is the
 * date of birth, 4a the issue date, 4b the expiry — and the expiry is always
 * the latest of them. A certificate prints an issue date and an expiry, and the
 * expiry is later. "The furthest in the future" is therefore right far more
 * often than not, and wrong in a way the member sees and corrects before they
 * send it.
 */

export interface FoundDate {
  /** ISO, always. */
  iso: string;
  /** Exactly as it was printed, for showing back to a person. */
  raw: string;
  /**
   * How the expiry was chosen (suggestExpiry only):
   *   LABEL  — printed next to "Expiry", "Gültig bis", "4b." … — the document said so.
   *   LATEST — the furthest date in the future, the fallback guess.
   */
  basis?: 'LABEL' | 'LATEST';
  /** The label it was found beside, as printed. */
  label?: string;
}

/**
 * Month names as these documents print them, in the five languages the product
 * speaks, full and abbreviated. Accents are folded before lookup.
 */
const MONTHS: Record<string, number> = (() => {
  const table: [number, string[]][] = [
    [1, ['jan', 'january', 'januar', 'janner', 'janvier', 'gennaio', 'gen', 'enero', 'ene']],
    [2, ['feb', 'february', 'februar', 'fevrier', 'fevr', 'febbraio', 'febrero']],
    [3, ['mar', 'march', 'marz', 'maerz', 'mrz', 'mars', 'marzo']],
    [4, ['apr', 'april', 'avril', 'avr', 'aprile', 'abril', 'abr']],
    [5, ['may', 'mai', 'maggio', 'mag', 'mayo']],
    [6, ['jun', 'june', 'juni', 'juin', 'giugno', 'giu', 'junio']],
    [7, ['jul', 'july', 'juli', 'juillet', 'juil', 'luglio', 'lug', 'julio']],
    [8, ['aug', 'august', 'aout', 'agosto', 'ago']],
    [9, ['sep', 'sept', 'september', 'septembre', 'settembre', 'set', 'septiembre', 'setiembre']],
    [10, ['oct', 'october', 'okt', 'oktober', 'octobre', 'ottobre', 'ott', 'octubre']],
    [11, ['nov', 'november', 'novembre', 'noviembre']],
    [12, ['dec', 'december', 'dez', 'dezember', 'decembre', 'dicembre', 'dic', 'diciembre']],
  ];
  const out: Record<string, number> = {};
  for (const [m, names] of table) for (const n of names) out[n] = m;
  return out;
})();

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const monthOf = (word: string): number | null => MONTHS[fold(word).replace(/\.$/, '')] ?? null;

/**
 * Every date in a block of text, in the formats these documents print.
 *
 * Deliberately narrow. Accepting more formats does not find more dates on a
 * driving licence; it finds more NON-dates in the noise an OCR returns from a
 * hologram, and each of those is a wrong suggestion somebody has to notice.
 */
export function findDates(text: string, now: Date = new Date()): FoundDate[] {
  const out: FoundDate[] = [];
  const seen = new Set<string>();

  const push = (y: number, m: number, d: number, raw: string) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    // A document nobody alive is holding, or one issued a century early: the
    // OCR read something that was not a date.
    if (y < now.getFullYear() - 120 || y > now.getFullYear() + 60) return;
    const date = new Date(Date.UTC(y, m - 1, d));
    // Rejects 31 February, which the range check above lets through.
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return;
    const iso = date.toISOString().slice(0, 10);
    if (seen.has(iso)) return;
    seen.add(iso);
    out.push({ iso, raw });
  };

  // 31.12.2030 / 31-12-2030 / 31/12/2030 — the European order, which is what
  // every document in this product's market prints.
  for (const m of text.matchAll(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/g)) {
    push(Number(m[3]), Number(m[2]), Number(m[1]), m[0]);
  }
  // 2030-12-31 — ISO, printed on some certificates.
  for (const m of text.matchAll(/\b(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]), m[0]);
  }
  // 12/31/2030 — the American order, ONLY where the European reading is
  // impossible (a "month" over 12). Never guessed when both readings exist.
  for (const m of text.matchAll(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/g)) {
    if (Number(m[2]) > 12 && Number(m[1]) <= 12) push(Number(m[3]), Number(m[1]), Number(m[2]), m[0]);
  }
  /*
    Month names: 12SEP2031 (visas), 12 Sep 2031, 12-Sep-2031, 12. September 2031,
    12 de septiembre de 2031 — and the American "Sept 12, 2031".
    A word is only a month if the table says so, so "12 MAIN 2031" stays noise.
  */
  for (const m of text.matchAll(/\b(\d{1,2})\.?[\s\-]*(?:de\s+)?([A-Za-zÀ-ÿ]{3,10})\.?[\s\-,]*(?:de\s+)?(\d{4})\b/g)) {
    const month = monthOf(m[2]!);
    if (month) push(Number(m[3]), month, Number(m[1]), m[0]);
  }
  for (const m of text.matchAll(/\b([A-Za-zÀ-ÿ]{3,10})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const month = monthOf(m[1]!);
    if (month) push(Number(m[3]), month, Number(m[2]), m[0]);
  }
  // 31.12.30 — two digits, and only where the century is unambiguous: a date
  // on one of these documents is never more than a few decades either way.
  for (const m of text.matchAll(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2})\b(?!\d)/g)) {
    const yy = Number(m[3]);
    const century = now.getFullYear() - (now.getFullYear() % 100);
    const year = century + yy > now.getFullYear() + 60 ? century - 100 + yy : century + yy;
    push(year, Number(m[2]), Number(m[1]), m[0]);
  }

  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

/**
 * Which of them is probably the expiry.
 *
 * The latest one in the future. On an EU driving licence the three printed
 * dates are birth, issue and expiry, in that order — so the last is the expiry.
 * On a certificate it is issue and expiry, and the expiry is later.
 *
 * Returns null rather than guessing when the only dates found are in the past:
 * a document whose every date has gone is either expired, in which case the
 * member should say so deliberately, or misread, in which case a confident
 * suggestion is worse than none.
 */
export function suggestExpiry(text: string, now: Date = new Date()): FoundDate | null {
  const labelled = expiryByLabel(text, now);
  if (labelled !== undefined) return labelled;
  const future = findDates(text, now).filter((d) => new Date(d.iso).getTime() > now.getTime());
  return future.length > 0 ? { ...future[future.length - 1]!, basis: 'LATEST' } : null;
}

/**
 * The words a document prints in front of its expiry, in the five languages.
 *
 * "4b" is the EU driving licence's numbered field for the expiry; "4a" (issue)
 * and "3" (birth) are deliberately NOT here. Longest first, so "expiration date"
 * wins over "exp".
 */
const EXPIRY_LABELS = [
  'date of expiration', 'expiration date', 'date of expiry', 'expiry date', 'expiration', 'expiry', 'expires on', 'expires',
  'exp date', 'exp.', 'exp', 'valid until', 'valid thru', 'valid through', 'valid till', 'valid to', 'good thru', 'good through',
  'gultig bis', 'gueltig bis', 'ablaufdatum', 'lauft ab am', 'lauft ab', 'ablauf', 'befristet bis', 'gultigkeit bis',
  "date d'expiration", "date d'echeance", "valable jusqu'au", "valable jusqu'a", 'expire le',
  'data di scadenza', 'scadenza', 'scade il', 'valido fino al', 'valida fino al',
  'fecha de vencimiento', 'fecha de caducidad', 'vencimiento', 'caducidad', 'valido hasta', 'vence',
  '4b.', '4b',
].sort((a, b) => b.length - a.length);

/**
 * The date printed BESIDE an expiry label — on the same line after it, or on
 * the line below (a label above its value is how cards lay it out). A document
 * saying which date is the expiry beats any rule about which date is latest.
 * A labelled date in the past ends the search with nothing: the document has
 * named its expiry and it has gone, so the latest-date guess must not overrule it.
 */
function expiryByLabel(text: string, now: Date): FoundDate | null | undefined {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const folded = fold(lines[i]!);
    for (const label of EXPIRY_LABELS) {
      // Whole words only: "vence" must not fire inside "Provence".
      const at = wordIndex(folded, label);
      if (at < 0) continue;
      const after = lines[i]!.slice(at + label.length);
      const found = findDatesInOrder(after, now)[0] ?? underLabel(lines[i + 1] ?? '', at, now);
      if (!found) continue;
      // A labelled date already gone is not offered — the same rule as the
      // fallback below: an expired document is said deliberately, never pre-filled.
      if (new Date(found.iso).getTime() <= now.getTime()) return null;
      return { ...found, basis: 'LABEL', label: lines[i]!.slice(at, at + label.length).trim() };
    }
  }
  return undefined; // no labelled date: fall back to the latest one
}

/** A label only as words of its own — never "4b" inside "4ba" or "exp" inside "export". */
function wordIndex(haystack: string, word: string): number {
  const m = new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).exec(haystack);
  return m ? m.index + m[1]!.length : -1;
}

/**
 * The value on the line below a label. Cards lay labels out as COLUMNS —
 * "Issue Date    Expiration Date" over "15SEP2021    12SEP2031" — so the date
 * that belongs to the label is the one standing under it, not the first one.
 */
function underLabel(line: string, column: number, now: Date): FoundDate | undefined {
  const dates = findDates(line, now);
  let best: FoundDate | undefined;
  let bestDistance = Infinity;
  for (const d of dates) {
    const distance = Math.abs(line.indexOf(d.raw) - column);
    if (distance < bestDistance) { best = d; bestDistance = distance; }
  }
  return best;
}

/** findDates, but in the order they appear on the line — the first after a label is the one it names. */
function findDatesInOrder(text: string, now: Date): FoundDate[] {
  return findDates(text, now).sort((a, b) => text.indexOf(a.raw) - text.indexOf(b.raw));
}
