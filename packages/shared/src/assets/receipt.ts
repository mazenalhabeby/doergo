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
const TOTAL_WORDS = [
  'total', 'gesamt', 'gesamtbetrag', 'summe', 'zu zahlen', 'zahlbetrag', 'endbetrag',
  'betrag', 'importe', 'suma', 'totale', 'montant', 'a payer', 'importo', 'totaal',
];

/* Words that sit beside a number which is NOT the total, however large. */
const NOT_TOTAL_WORDS = [
  'zwischensumme', 'subtotal', 'sub total', 'netto', 'net', 'mwst', 'ust', 'vat', 'tax',
  'iva', 'tva', 'rabatt', 'discount', 'change', 'ruckgeld', 'given', 'gegeben', 'bar',
  'preis/l', 'eur/l', 'liter', 'litre', 'menge', 'einzelpreis', 'unit',
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

const has = (haystack: string, words: string[]): boolean =>
  words.some((w) => haystack.includes(w));

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
  let best: { cents: number; raw: string; confidence: ReadConfidence } | null = null;

  for (const row of rows) {
    const flat = fold(row);
    if (has(flat, NOT_TOTAL_WORDS)) continue;
    const labelled = has(flat, TOTAL_WORDS);
    const figures = stripDates(row).match(MONEY) ?? [];
    for (const figure of figures) {
      if (!labelled && !looksLikeMoney(figure)) continue;
      const cents = moneyToCents(figure);
      if (cents == null) continue;
      /*
        A labelled figure beats any unlabelled one, whatever the amounts.

        The other way round — biggest wins — reads the odometer off a fuel slip
        ("184 320 km") as a €184,320 fill. Confidence is the point of the
        distinction, not a tie-break.
      */
      if (labelled) {
        if (!best || best.confidence !== 'certain' || cents > best.cents) {
          best = { cents, raw: figure, confidence: 'certain' };
        }
      } else if (!best) {
        best = { cents, raw: figure, confidence: 'likely' };
      } else if (best.confidence === 'likely' && cents > best.cents) {
        best = { cents, raw: figure, confidence: 'likely' };
      }
    }
  }

  if (best) out.totalCents = { value: best.cents, confidence: best.confidence, raw: best.raw };

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
