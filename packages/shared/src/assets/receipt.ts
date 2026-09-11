/**
 * A photograph of a receipt → the three things somebody would otherwise type.
 *
 * A driver fills the van at a motorway pump and is expected to file the cost.
 * The realistic alternative is that they do not: they keep the slip in the door
 * pocket, hand a fistful of them in at the end of the month, and somebody in
 * the office types them. Reading the slip on the phone is the difference
 * between an expense filed in fifteen seconds at the pump and one filed in
 * March, badly.
 *
 * Everything here is a SUGGESTION, exactly as a scraped document date is. The
 * screen shows what was read and what was guessed in different colours and the
 * person confirms before anything is sent, because a receipt has no check digit
 * and an OCR reading 8 as 3 is not a rare event.
 *
 * ⚠️ THE AMOUNT IS THE FIELD THAT MUST NOT BE QUIETLY WRONG. A misread date is
 * visible and annoying; a misread total is money, and it is the number nobody
 * re-reads once it looks plausible. So the total is only reported as `certain`
 * when a line SAYS it is the total, and everything else is `likely` at best.
 */

import { findDates, type FoundDate } from '../documents/dates-from-text';

export type ReadConfidence = 'certain' | 'likely';

export interface ReadValue<T> {
  value: T;
  confidence: ReadConfidence;
  /** Exactly as it was printed, so a person can check it against the paper. */
  raw: string;
}

export interface ParsedReceipt {
  /** Integer cents, always positive. The direction is the category's business. */
  totalCents?: ReadValue<number>;
  /** ISO date, when the slip printed one. */
  date?: ReadValue<string>;
  /** Who was paid — the top of the slip, usually. */
  vendor?: ReadValue<string>;
  /** ISO 4217 where the slip names one. */
  currency?: string;
  /**
   * Which of the KIND's money categories this looks like — "Fuel", "Service".
   * A word, matched by the caller against what the kind actually declares; this
   * module knows nothing about any particular customer's headings.
   */
  hint?: 'fuel' | 'service' | 'parts' | 'toll' | 'insurance' | 'cleaning';
}

/** Accents folded, so "GESAMTBETRÄGE" matches the same rule as "GESAMTBETRAEGE". */
const fold = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/*
  The words a receipt prints beside the number that matters, in the languages
  this product ships in. Deliberately NOT a general "biggest number" rule:
  a fuel receipt prints the litre price, the odometer, the pump number and the
  card's last four, and at least one of those beats the total on a bad read.
*/
/*
  THE FINAL, PAYABLE AMOUNT. On an invoice this is the gross — what the customer
  actually transfers — and it is the one figure that is never a subtotal, never
  a net, and never a tax line.
*/
const GRAND_TOTAL_WORDS = [
  'gesamtbetrag', 'rechnungsbetrag', 'gesamtsumme', 'bruttobetrag', 'endbetrag',
  'zu zahlen', 'zu zahlender betrag', 'zahlbetrag', 'zahlungsbetrag',
  'grand total', 'total due', 'amount due', 'balance due', 'total amount',
  'total ttc', 'net a payer', 'montant total', 'totale documento', 'importo totale',
  'total a pagar', 'importe total', 'te betalen', 'totaalbedrag',
];

/*
  A total, probably — but the word alone does not say WHICH total. An invoice
  prints "Summe" over the net and again over the gross; a till slip prints
  "TOTAL" once and means it.
*/
const TOTAL_WORDS = [
  'total', 'gesamt', 'summe', 'betrag', 'importe', 'suma', 'totale', 'montant',
  'a payer', 'importo', 'totaal', 'brutto', 'inkl', 'incl',
];

/*
  Words that sit beside a number which is NOT the total, however large.

  ⚠️ MATCHED ON WORD BOUNDARIES, never as substrings — see `has()`. As a plain
  `includes` this list was actively destructive: 'net' struck out any line
  containing "Internet", "Kabinett" or "Magnetventil", and 'bar' struck out
  "Barcode". A workshop invoice with an internet-service line lost its total to
  a three-letter substring.
*/
const NOT_TOTAL_WORDS = [
  'zwischensumme', 'subtotal', 'sub total', 'netto', 'net', 'nettobetrag',
  'mwst', 'ust', 'vat', 'tax', 'steuer', 'iva', 'tva', 'taxe',
  'rabatt', 'discount', 'skonto', 'change', 'ruckgeld', 'given', 'gegeben', 'bar',
  'anzahlung', 'deposit', 'guthaben', 'credit',
  'preis/l', 'eur/l', 'liter', 'litre', 'menge', 'einzelpreis', 'unit', 'stk',
];

const CURRENCIES: Array<[RegExp, string]> = [
  [/€|\beur\b/i, 'EUR'],
  [/\bchf\b|\bsfr\b/i, 'CHF'],
  [/£|\bgbp\b/i, 'GBP'],
  [/\$|\busd\b/i, 'USD'],
];

/**
 * A printed money figure → cents.
 *
 * Both separators are accepted because both are printed: 1.234,56 in Austria
 * and 1,234.56 on an international card slip. The LAST separator decides which
 * one is decimal, which is the only rule that gets both right without knowing
 * where the slip came from.
 *
 * Returns null rather than 0 for anything unreadable — 0 is a value somebody
 * could file.
 */
export function moneyToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/-/g, '');
  if (!/\d/.test(cleaned)) return null;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const decimalAt = Math.max(lastDot, lastComma);

  let whole = cleaned;
  let fraction = '';
  if (decimalAt > -1) {
    const tail = cleaned.slice(decimalAt + 1);
    // Exactly two digits after the last separator is a decimal; three is a
    // thousands group ("1.234"), and treating it as cents divides by ten.
    if (/^\d{1,2}$/.test(tail)) {
      whole = cleaned.slice(0, decimalAt);
      fraction = tail.padEnd(2, '0');
    }
  }

  const digits = whole.replace(/[.,]/g, '');
  if (!digits) return null;
  const cents = Number(digits) * 100 + Number(fraction || '0');
  if (!Number.isFinite(cents) || cents <= 0) return null;
  // A receipt for more than a million euros is an OCR artefact, not a purchase.
  if (cents > 100_000_000) return null;
  return Math.round(cents);
}

/** Every money-looking figure on a line. */
const MONEY = /\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2}/g;

/**
 * Blank out anything that is a DATE before looking for money.
 *
 * ⚠️ Not tidiness — a correctness fix. "09.09.2026" contains "202", and the
 * scanner read that as €2.02 and offered it as the total of a €148 repair. A
 * date is the one thing on a slip guaranteed to look like a figure, so it is
 * removed from the row rather than argued with afterwards.
 */
const stripDates = (row: string): string =>
  row
    .replace(/\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b/g, ' ')
    .replace(/\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[:.]\d{2}(?::\d{2})?\b/g, ' ');

/**
 * An unlabelled figure has to LOOK like money — two digits after a separator.
 *
 * A slip is full of bare integers: the pump number, the till, the odometer, the
 * card's last four. None of them is ever offered as an amount, because the one
 * signal that separates a price from a serial number is the cents.
 */
const looksLikeMoney = (figure: string): boolean => /[.,]\d{2}$/.test(figure);

/**
 * Does this line carry one of these words — as a WORD, not as a substring?
 *
 * ⚠️ `includes` was doing real damage. 'net' matched inside "Internet",
 * "Kabinett" and "Magnetventil"; 'bar' matched inside "Barcode"; 'tax' inside
 * "Taxi". Each of those silently struck a line out of the running, and the line
 * struck out is sometimes the one carrying the total.
 *
 * Multi-word entries ("zu zahlen") still have to match across a space, so the
 * boundary is built around the whole phrase rather than tokenising.
 */
const has = (haystack: string, words: string[]): boolean =>
  words.some((w) => {
    const i = haystack.indexOf(w);
    if (i === -1) return false;
    const before = i === 0 ? '' : haystack[i - 1]!;
    const after = haystack[i + w.length] ?? '';
    const isLetter = (c: string) => c !== '' && /[\p{L}\p{N}]/u.test(c);
    return !isLetter(before) && !isLetter(after);
  });

/**
 * Read a receipt out of the lines an OCR returned, in order.
 *
 * @param lines Top to bottom, as printed. Order matters: the vendor is at the
 *              top, and the total is near the bottom.
 */
export function parseReceipt(lines: string[], now: Date = new Date()): ParsedReceipt {
  const rows = lines.map((l) => (l ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const text = rows.join('\n');
  const out: ParsedReceipt = {};

  for (const [re, code] of CURRENCIES) {
    if (re.test(text)) { out.currency = code; break; }
  }

  // ── The total ──────────────────────────────────────────────────────────────
  /*
    SCORED, not a yes/no label.

    The old rule had two tiers — "a line says total" and "everything else" — and
    within the second it took the biggest figure. That is right for a till slip
    and wrong for an invoice, which is what was reported: an invoice prints a
    net, a tax and a gross, plus a table of line items, and the word "Summe"
    can sit over any of them. The biggest unlabelled figure on such a page is
    frequently a line item, and the first one found is almost never the total.

    Three tiers now:

      3  a GRAND total — "Gesamtbetrag", "Total due", "Zu zahlen". The final
         payable figure, by name. Nothing outranks it.
      2  a total word — "Summe", "Total", "Brutto". Probably right, and when a
         page has several the largest is the gross, which is the one wanted.
      1  a bare figure that looks like money. Last resort, still offered,
         clearly marked a guess.

    ⚠️ AND THE LABEL NEED NOT BE ON THE SAME LINE. An invoice is a table: OCR
    returns "Gesamtbetrag" and "1.234,56" as separate lines because they are
    separated by half a page of whitespace. Reading only the labelled line finds
    no figure at all and falls through to tier 1 — which is exactly how a total
    becomes "the first amount on the page". A label with no figure of its own
    adopts the next line that has one.
  */
  type Candidate = { cents: number; raw: string; tier: number };
  let best: Candidate | null = null;
  /*
    How many lines claimed to be a total.

    ⚠️ This is what separates a till slip from an invoice. "GESAMT EUR 81,41" on
    a fuel slip is THE total and deserves to be reported as read. The same word
    on an invoice appears over the net, again over the tax and again over the
    gross — and then it says nothing about which one this is. One claim is a
    fact; several are a choice, and a choice is a guess.
  */
  let totalClaims = 0;

  const consider = (cents: number, raw: string, tier: number) => {
    if (!best || tier > best.tier || (tier === best.tier && cents > best.cents)) {
      best = { cents, raw, tier };
    }
  };

  /** How far a label will reach for its number. Two lines: a table row, no more. */
  const LABEL_REACH = 2;

  const figuresOn = (row: string): string[] => stripDates(row).match(MONEY) ?? [];

  rows.forEach((row, i) => {
    const flat = fold(row);
    if (has(flat, NOT_TOTAL_WORDS)) return;

    const tier = has(flat, GRAND_TOTAL_WORDS) ? 3 : has(flat, TOTAL_WORDS) ? 2 : 1;

    let figures = figuresOn(row).filter((f) => tier > 1 || looksLikeMoney(f));

    /*
      A labelled line with no number reaches forward for one. Only forward, and
      only past lines that carry no figure of their own: a label reaching over
      somebody else's amount would attribute it to the wrong row.
    */
    if (tier > 1 && figures.length === 0) {
      for (let j = i + 1; j <= i + LABEL_REACH && j < rows.length; j++) {
        const next = fold(rows[j]!);
        // Never adopt a figure that belongs to an excluded line — the tax row
        // immediately under "Summe" is the classic way to read VAT as a total.
        if (has(next, NOT_TOTAL_WORDS)) break;
        const found = figuresOn(rows[j]!).filter(looksLikeMoney);
        if (found.length > 0) { figures = found; break; }
      }
    }

    let took = false;
    for (const figure of figures) {
      const cents = moneyToCents(figure);
      if (cents == null) continue;
      consider(cents, figure, tier);
      took = true;
    }
    if (took && tier >= 2) totalClaims++;
  });

  if (best) {
    /*
      A named grand total is the only thing reported as certain.

      Tier 2 is a total word with no guarantee of WHICH total, and tier 1 is a
      figure that merely looks like money — both are offered, both are marked a
      guess, and the screen colours them differently so the person checks.
    */
    const b: Candidate = best;
    const certain = b.tier === 3 || (b.tier === 2 && totalClaims === 1);
    out.totalCents = { value: b.cents, raw: b.raw, confidence: certain ? 'certain' : 'likely' };
  }

  // ── The date ───────────────────────────────────────────────────────────────
  /*
    A receipt's date is in the PAST and close to today. Future dates on a slip
    are card expiry and warranty end, and the nearest past date is the purchase
    far more often than the earliest or the latest is.
  */
  const dates = findDates(text, now).filter((d) => new Date(d.iso).getTime() <= now.getTime() + 86_400_000);
  const nearest: FoundDate | undefined = dates[dates.length - 1];
  if (nearest) {
    const days = Math.abs(now.getTime() - new Date(nearest.iso).getTime()) / 86_400_000;
    out.date = { value: nearest.iso, raw: nearest.raw, confidence: days <= 90 ? 'certain' : 'likely' };
  }

  // ── Who was paid ───────────────────────────────────────────────────────────
  /*
    The first line with letters and no money on it. A vendor name is at the top
    of every slip; anything cleverer would need a directory of petrol stations,
    and getting it wrong costs a person one tap to fix.
  */
  const vendor = rows.find((r) => /\p{L}{3}/u.test(r) && !/\d{2}[.,]\d{2}/.test(r) && r.length <= 60);
  if (vendor) out.vendor = { value: vendor, raw: vendor, confidence: 'likely' };

  // ── What it was for ────────────────────────────────────────────────────────
  const flat = fold(text);
  if (/diesel|benzin|petrol|super\b|unleaded|gasoil|tankstelle|fuel|kraftstoff|carburant/.test(flat)) out.hint = 'fuel';
  else if (/service|inspektion|wartung|reparatur|repair|werkstatt|garage|olwechsel|oil change/.test(flat)) out.hint = 'service';
  else if (/ersatzteil|teile|parts|reifen|tyre|tire|batterie|filter/.test(flat)) out.hint = 'parts';
  else if (/maut|toll|vignette|autobahn|parking|parkhaus/.test(flat)) out.hint = 'toll';
  else if (/versicherung|insurance|assurance|police/.test(flat)) out.hint = 'insurance';
  else if (/waschanlage|car wash|waschen|cleaning|reinigung/.test(flat)) out.hint = 'cleaning';

  return out;
}

/**
 * The kind's own category that best matches what the slip looked like.
 *
 * The hint is a word in OUR vocabulary; the headings are the customer's, and a
 * German fleet's are "Treibstoff" and "Werkstatt". Matched loosely, and falling
 * back to the first OUT category, because a pre-selected wrong heading is one
 * tap to change and a blank one is a form nobody can submit.
 */
const HINT_WORDS: Record<NonNullable<ParsedReceipt['hint']>, string[]> = {
  fuel: ['fuel', 'treibstoff', 'sprit', 'benzin', 'diesel', 'tank', 'carburante', 'carburant', 'combustible'],
  service: ['service', 'wartung', 'inspektion', 'werkstatt', 'repair', 'reparatur', 'manutenzione', 'entretien'],
  parts: ['part', 'teil', 'ersatz', 'ricambi', 'pieza', 'piece'],
  toll: ['toll', 'maut', 'vignette', 'parking', 'parken', 'pedaggio', 'peaje', 'peage'],
  insurance: ['insur', 'versicher', 'assicur', 'seguro', 'assurance'],
  cleaning: ['clean', 'wasch', 'reinig', 'pulizia', 'limpieza', 'nettoyage'],
};

export function categoryForReceipt<T extends { label: string; direction: string }>(
  receipt: ParsedReceipt,
  categories: T[],
): T | null {
  const spend = categories.filter((c) => c.direction === 'out');
  if (spend.length === 0) return null;
  if (receipt.hint) {
    const words = HINT_WORDS[receipt.hint];
    const hit = spend.find((c) => words.some((w) => fold(c.label).includes(w)));
    if (hit) return hit;
  }
  return spend[0]!;
}
