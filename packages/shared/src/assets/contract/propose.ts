/** What accepting a contract would do: the record to create, the hand-over, what it retires. */
import type { DetailRow, KindShape } from '../../access/asset-kind-shape';
import type { CustodyPeriod } from '../custody';
import { END_WORDS, LABELS, clean, fold, type ParsedContract } from './parse';

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
