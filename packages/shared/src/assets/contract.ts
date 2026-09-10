/**
 * A contract → a proposal to create a thing, hand it over, and retire what it
 * replaces.
 *
 * The situation this exists for: a member is handed a rental agreement at a
 * desk. Somebody in the office then has to create the vehicle, type its plate
 * and model, assign it, find the old one and retire it — four screens, in an
 * order nobody remembers, days later if at all. The photograph in the member's
 * hand already says all of it.
 *
 * ⚠️ IT PROPOSES. IT NEVER ACTS. A reader that silently creates records will
 * eventually invent a van from a receipt, or a second copy of a car that
 * already exists, and the first anybody hears of it is a bill for an asset
 * nobody owns. Everything here returns a description of what WOULD happen; a
 * person agrees to it, and the server then recomputes it from scratch rather
 * than trusting what came back.
 *
 * ⚠️ AND IT IS NOT ABOUT CARS. The reader knows how to find a registration, a
 * VIN, a serial number and a pair of dates — facts that look the same on a
 * vehicle lease, a plant-hire note and a laptop handover form. What any of them
 * is CALLED is the kind's business (`KindShape.fields`), and `fieldsForKind`
 * below is the only place the two meet. A "Plate" field gets the registration;
 * a kind that asks for "Asset tag" gets the serial; a kind that asks for
 * neither gets a record with a name and nothing else, which is still correct.
 */

import { findDates } from '../documents/dates-from-text';
import type { KindShape, DetailRow } from '../access/asset-kind-shape';
import type { CustodyPeriod } from './custody';

/*
  The same two words the receipt reader uses, and deliberately the same type:
  every "read or guessed?" badge in the product means one thing, and a second
  vocabulary for the same distinction is how one screen starts colouring a guess
  green.
*/
import type { ReadConfidence } from './receipt';
export type { ReadConfidence };

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
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
  three letters, then digits and letters, usually with a separator. Deliberately
  loose about the separator and deliberately strict about the length — the loose
  version matches half the reference numbers on a contract.
*/
const REGISTRATION = /\b([A-ZÄÖÜ]{1,3})[\s-]?([0-9]{1,5}\s?[A-Z]{0,3})\b/;

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
      if (m && /\d/.test(m[0]!)) {
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

// ─────────────────────────────────────────────────────────────────────────────
// From a reading to a proposal
// ─────────────────────────────────────────────────────────────────────────────

/** What the new record would be called, and what it would carry. */
export interface ProposedAsset {
  name: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  /** Values for the fields the KIND asks for, matched by label. */
  details: DetailRow[];
}

export type ProposalStep =
  | { kind: 'create'; asset: ProposedAsset }
  | { kind: 'hand-over'; startsOn?: string }
  | { kind: 'close'; assetId: string; assetName: string }
  | { kind: 'retire'; assetId: string; assetName: string };

export interface ContractProposal {
  asset: ProposedAsset;
  /** What the reading says, step by step, in the order it would happen. */
  steps: ProposalStep[];
  /** Nothing was identified well enough to name a record. */
  problems: Array<{ kind: 'no-name' } | { kind: 'no-holder' }>;
}

/**
 * The thing's name, from whatever the contract identified it by.
 *
 * A registration first, because it is what everybody calls a vehicle; then a
 * serial; then the make and model together, which is what a laptop handover
 * gives you. Empty when the reader found nothing — and that is a PROBLEM, not
 * a record called "Untitled": an asset nobody can identify is worse than the
 * two minutes of typing it saved.
 */
export function nameFromContract(parsed: ParsedContract): string {
  if (parsed.registration) return parsed.registration.value;
  if (parsed.serial) return parsed.serial.value;
  const made = [parsed.manufacturer?.value, parsed.model?.value].filter(Boolean).join(' ');
  return clean(made);
}

/**
 * Which of the kind's own fields the reading can fill.
 *
 * ⚠️ THE ONLY PLACE the reader's vocabulary meets a customer's. Matched on the
 * field's LABEL, loosely and case-insensitively, so a kind that calls it
 * "Kennzeichen" is filled by the same reading that fills one calling it "Plate"
 * — and a kind that asks for neither is simply not filled, rather than having
 * our words forced onto it.
 */
export function fieldsForKind(shape: KindShape, parsed: ParsedContract): DetailRow[] {
  const source: Array<[string[], string | undefined]> = [
    [LABELS.registration, parsed.registration?.value],
    [LABELS.vin, parsed.vin?.value],
    [LABELS.serial, parsed.serial?.value],
    [LABELS.model, parsed.model?.value],
    [LABELS.manufacturer, parsed.manufacturer?.value],
    [END_WORDS, parsed.endsOn?.value],
  ];

  const rows: DetailRow[] = [];
  for (const field of shape.fields) {
    const label = fold(field.label);
    for (const [words, value] of source) {
      if (!value) continue;
      if (!words.some((w) => label.includes(w) || w.includes(label))) continue;
      rows.push({ label: field.label, value });
      break;
    }
  }
  return rows;
}

/**
 * What accepting this contract would DO.
 *
 * Three writes, and the third is the one people forget: the car they were
 * driving until this morning goes on holding an open custody, so every fuel
 * receipt after today lands against the wrong vehicle and the old one goes on
 * being billed. Naming it here is the difference between a shortcut and a
 * system that keeps the books straight on its own.
 *
 * @param holding  The member's OPEN custody periods of THIS KIND. Passed in
 *                 rather than looked up, because this function is pure and both
 *                 the phone and the server call it with what they each know.
 */
export function proposeFromContract(input: {
  parsed: ParsedContract;
  shape: KindShape;
  holderUserId?: string | null;
  holding?: Array<CustodyPeriod & { assetId: string; assetName: string }>;
  /** Retire what it replaces, or leave it on the books. The person decides. */
  retireReplaced?: boolean;
}): ContractProposal {
  const { parsed, shape } = input;
  const problems: ContractProposal['problems'] = [];

  const name = nameFromContract(parsed);
  if (!name) problems.push({ kind: 'no-name' });
  if (!input.holderUserId) problems.push({ kind: 'no-holder' });

  const asset: ProposedAsset = {
    name,
    serialNumber: parsed.vin?.value ?? parsed.serial?.value,
    model: parsed.model?.value,
    manufacturer: parsed.manufacturer?.value,
    details: fieldsForKind(shape, parsed),
  };

  const steps: ProposalStep[] = [{ kind: 'create', asset }];
  if (input.holderUserId) steps.push({ kind: 'hand-over', startsOn: parsed.startsOn?.value });

  /*
    Only what this member holds OF THIS KIND is replaced.

    Somebody can hold a van and a laptop at once, and a contract for a van says
    nothing about the laptop. Scoping the replacement to the kind is what keeps
    "and deactivate the old one" from quietly taking somebody's tools away.
  */
  for (const held of input.holding ?? []) {
    steps.push({ kind: 'close', assetId: held.assetId, assetName: held.assetName });
    if (input.retireReplaced) {
      steps.push({ kind: 'retire', assetId: held.assetId, assetName: held.assetName });
    }
  }

  return { asset, steps, problems };
}

/** A proposal worth carrying out. */
export function canApply(proposal: ContractProposal): boolean {
  return proposal.problems.length === 0;
}
