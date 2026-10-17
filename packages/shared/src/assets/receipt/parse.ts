/** Reading a photographed slip into amount, date and vendor, and the category it suggests. */
import { findDates, type FoundDate } from '../../documents/dates-from-text';
import {
  CURRENCIES,
  GRAND_TOTAL_WORDS,
  MONEY,
  NOT_TOTAL_WORDS,
  TOTAL_WORDS,
  fold,
  has,
  looksLikeMoney,
  moneyToCents,
  stripDates,
  type ParsedReceipt,
} from './money';

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
