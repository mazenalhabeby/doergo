/** Reading a contract's text: the plate, the VIN, the dates, the parties. */
import type { ReadConfidence } from '../receipt';
import { foldText } from '../../utils/fold';
import { findDates } from '../../documents/dates-from-text';

export interface ContractValue<T> {
  value: T;
  confidence: ReadConfidence;
  /** Exactly as printed, so a person can check it against the paper. */
  raw: string;
}

export interface ParsedContract {
  /** A vehicle registration — "LL-123AB", "W 12345 X". */
  registration?: ContractValue<string>;
  /** A 17-character vehicle identification number. Proved by its own shape. */
  vin?: ContractValue<string>;
  /** Any other serial the document identifies the thing by. */
  serial?: ContractValue<string>;
  manufacturer?: ContractValue<string>;
  model?: ContractValue<string>;
  /** When the holder gets it. */
  startsOn?: ContractValue<string>;
  /** When they are due to give it back. */
  endsOn?: ContractValue<string>;
  /** Every line, so a wrong guess is one tap to fix rather than a re-scan. */
  lines: string[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

const fold = foldText;

/*
  A VIN is the one identifier on any of these documents that PROVES itself:
  exactly 17 characters, and I, O and Q are excluded by the standard precisely
  so they cannot be confused with 1 and 0. A 17-character run that respects that
  exclusion is not a coincidence, which is why this is the only field here that
  can come back `certain` from its shape alone.
*/
const VIN = /\b([A-HJ-NPR-Z0-9]{17})\b/;

/*
  A registration, as Austria, Germany and their neighbours print one: one to
  three letters, then digits and letters, usually with a separator.

  ⚠️ AT LEAST TWO DIGITS, and that is not cosmetic. With one, "Seite 3 von 7"
  matches — "VON 7" is three uppercase letters, a space and a digit — and a
  page-number footer became the registration of a vehicle. Every plate this is
  ever asked to read has two or more.
*/
const REGISTRATION = /\b([A-ZÄÖÜ]{1,3})[\s-]?([0-9]{2,5}\s?[A-Z]{0,3})\b/;

/*
  Letter blocks that fit the shape and are never a registration.

  The second half of the same problem: "TEL 43 664…" and "NR 2026" both match
  perfectly well. A short list of the words that actually appear in this
  position on a contract is worth more than any amount of regex tightening,
  because the shape genuinely is ambiguous — only the vocabulary is not.
*/
const NOT_A_PLATE = new Set([
  'VON', 'NR', 'SEITE', 'PAGE', 'TEL', 'FAX', 'EUR', 'CHF', 'USD', 'MWST', 'UST', 'VAT',
  'IBAN', 'BIC', 'ATU', 'DE', 'PLZ', 'ZIP', 'KM', 'PS', 'KW', 'NO', 'REF', 'ART', 'POS',
]);

/** Labels that introduce the thing's identifier, in the five languages we ship. */
const LABELS: Record<'registration' | 'vin' | 'serial' | 'model' | 'manufacturer', string[]> = {
  registration: ['kennzeichen', 'amtliches kennzeichen', 'registration', 'reg no', 'plate', 'licence plate',
    'license plate', 'matricula', 'matricula del vehiculo', 'immatriculation', 'targa', 'polizza'],
  vin: ['fahrgestellnummer', 'fin', 'vin', 'chassis', 'chassis no', 'bastidor', 'telaio', 'numero de chassis'],
  serial: ['seriennummer', 'serial', 'serial no', 'serial number', 'geratenummer', 'inventarnummer',
    'asset tag', 'numero de serie', 'matricola', 'numero di serie'],
  model: ['modell', 'model', 'typ', 'type', 'modelo', 'modele', 'modello', 'fahrzeugtyp', 'vehicle'],
  manufacturer: ['hersteller', 'marke', 'make', 'manufacturer', 'brand', 'marca', 'marque', 'fabricante'],
};

const START_WORDS = ['beginn', 'mietbeginn', 'von', 'ab', 'start', 'from', 'commencing', 'inicio', 'desde',
  'debut', 'du', 'inizio', 'dal', 'ubergabe', 'handover', 'collection'];

const END_WORDS = ['ende', 'mietende', 'bis', 'until', 'to', 'end', 'return', 'ruckgabe', 'fin', 'hasta',
  'jusqu', 'au', 'fine', 'al', 'expiry', 'ablauf'];

/** The value on a labelled line: whatever follows the colon, or the label. */
function afterLabel(line: string, labels: string[]): string | null {
  const flat = fold(line);
  for (const label of labels) {
    const at = flat.indexOf(label);
    if (at === -1) continue;
    const rest = clean(line.slice(at + label.length).replace(/^[\s:.\-–—]+/, ''));
    if (rest) return rest;
  }
  return null;
}

/** Does this line carry one of these words at all? */
const mentions = (line: string, words: string[]) => {
  const flat = fold(line);
  return words.some((w) => new RegExp(`\\b${w}`).test(flat));
};

/**
 * Read a contract out of the lines an OCR returned, in order.
 *
 * Every field is a SUGGESTION except a VIN, which proves itself. Order matters
 * only for the labels — a label and its value are on the same line far more
 * often than not, and where they are not, the reader simply finds nothing,
 * which is the correct outcome for a document it cannot read.
 */
export function parseContract(rawLines: string[], now: Date = new Date()): ParsedContract {
  const lines = rawLines.map(clean).filter(Boolean);
  const out: ParsedContract = { lines };

  // ── The identifiers ────────────────────────────────────────────────────────
  for (const line of lines) {
    if (!out.vin) {
      const labelled = afterLabel(line, LABELS.vin);
      const m = (labelled ?? line).match(VIN);
      /*
        Seventeen characters with no I, O or Q is the standard's own check. A
        labelled one and an unlabelled one are equally certain — the shape is
        the evidence, not the word beside it.
      */
      if (m) out.vin = { value: m[1]!.toUpperCase(), confidence: 'certain', raw: m[0]! };
    }
    if (!out.registration) {
      const labelled = afterLabel(line, LABELS.registration);
      if (labelled) {
        const m = labelled.toUpperCase().match(REGISTRATION);
        if (m) out.registration = { value: clean(m[0]!), confidence: 'certain', raw: labelled };
      }
    }
    if (!out.serial) {
      const labelled = afterLabel(line, LABELS.serial);
      if (labelled) out.serial = { value: labelled.slice(0, 60), confidence: 'certain', raw: labelled };
    }
    if (!out.model) {
      const labelled = afterLabel(line, LABELS.model);
      if (labelled) out.model = { value: labelled.slice(0, 60), confidence: 'certain', raw: labelled };
    }
    if (!out.manufacturer) {
      const labelled = afterLabel(line, LABELS.manufacturer);
      if (labelled) out.manufacturer = { value: labelled.slice(0, 60), confidence: 'certain', raw: labelled };
    }
  }

  /*
    An UNLABELLED registration, only if no labelled one was found.

    Contracts print reference numbers, customer numbers and postcodes that all
    match the same loose shape, so this is the reading most likely to be wrong —
    which is exactly why it comes back `likely` and never `certain`, and why the
    screen shows it in amber next to a box somebody can correct.
  */
  if (!out.registration) {
    for (const line of lines) {
      // Skip anything that looks like a date or a money figure: both match.
      if (/\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}/.test(line)) continue;
      if (/\d[.,]\d{2}\b/.test(line)) continue;
      const m = line.toUpperCase().match(REGISTRATION);
      if (m && !NOT_A_PLATE.has(m[1]!)) {
        out.registration = { value: clean(m[0]!), confidence: 'likely', raw: line };
        break;
      }
    }
  }

  // ── The term ───────────────────────────────────────────────────────────────
  /*
    A labelled date beats an unlabelled one, and where neither is labelled the
    two ends of the term are simply the earliest and the latest — which is right
    on a document that prints exactly two dates, and visibly wrong on one that
    prints five, where a person corrects it.
  */
  for (const line of lines) {
    const found = findDates(line, now);
    if (found.length === 0) continue;
    if (!out.startsOn && mentions(line, START_WORDS)) {
      out.startsOn = { value: found[0]!.iso, confidence: 'certain', raw: found[0]!.raw };
    }
    if (!out.endsOn && mentions(line, END_WORDS)) {
      out.endsOn = { value: found[found.length - 1]!.iso, confidence: 'certain', raw: found[found.length - 1]!.raw };
    }
  }
  if (!out.startsOn || !out.endsOn) {
    const all = findDates(lines.join('\n'), now);
    if (all.length >= 1 && !out.startsOn) {
      out.startsOn = { value: all[0]!.iso, confidence: 'likely', raw: all[0]!.raw };
    }
    if (all.length >= 2 && !out.endsOn) {
      const last = all[all.length - 1]!;
      // An "end" earlier than the start is not an end — it is another date.
      if (!out.startsOn || last.iso > out.startsOn.value) {
        out.endsOn = { value: last.iso, confidence: 'likely', raw: last.raw };
      }
    }
  }

  return out;
}

export { clean, fold, LABELS, END_WORDS };
