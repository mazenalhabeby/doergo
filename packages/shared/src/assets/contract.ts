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
/*
  The same two words the receipt reader uses, and deliberately the same type:
  every "read or guessed?" badge in the product means one thing, and a second
  vocabulary for the same distinction is how one screen starts colouring a guess
  green.
*/
export type { ReadConfidence } from './receipt';

export { type ContractValue, type ParsedContract, parseContract } from './contract/parse';
export {
  type ProposedAsset,
  type ProposalStep,
  type ContractProposal,
  nameFromContract,
  fieldsForKind,
  proposeFromContract,
  canApply,
} from './contract/propose';
