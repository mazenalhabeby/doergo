import type { DueItem, HeldAsset, MyExpense, MyLogEntry, MyProposal } from './api/assets';

export type EquipmentLoaded = {
  held: HeldAsset[];
  canPropose: boolean;
  expenses: MyExpense[];
  proposals: MyProposal[];
  entries: MyLogEntry[] | null;
  due: DueItem[];
  at: number;
};

/*
  What My equipment last read, per member — shown when a reload fails (with a
  line saying so), and what the home tile's badge counts. ⚠️ A failed load
  used to say "No equipment has been handed to you yet", which to somebody
  standing next to the van is simply untrue.
*/
let lastKnown: { userId: string; data: EquipmentLoaded } | null = null;

export function rememberEquipment(userId: string, data: EquipmentLoaded): void {
  lastKnown = { userId, data };
}

export function knownEquipment(userId: string | null | undefined): EquipmentLoaded | null {
  return lastKnown && lastKnown.userId === userId ? lastKnown.data : null;
}

/**
 * What was due when My equipment was last read — the home tile's badge. A
 * badge shows a count the phone already holds and never fetches one of its own.
 */
export function knownEquipmentDue(userId: string | null | undefined): number {
  return knownEquipment(userId)?.due.filter((d) => d.stage !== 'ok').length ?? 0;
}
