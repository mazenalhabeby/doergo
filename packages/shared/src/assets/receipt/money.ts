/** The words and number shapes a receipt is read by: totals, currencies, amounts, dates to ignore. */
import { foldText } from '../../utils/fold';

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
const fold = foldText;

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

export {
  fold,
  GRAND_TOTAL_WORDS,
  TOTAL_WORDS,
  NOT_TOTAL_WORDS,
  CURRENCIES,
  MONEY,
  stripDates,
  looksLikeMoney,
  has,
};
