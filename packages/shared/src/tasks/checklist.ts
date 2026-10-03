/**
 * A crew's CHECKLIST — who does what, and who did it. ONE rule for the server,
 * the web and the phone.
 *
 * Two facts per item, each answering a question the office asks after the job:
 *   • the OWNER (`assigneeId`, optional) — whose part of the work it is;
 *   • who TICKED it and when (`completedById` / `completedAt`) — recorded by the
 *     tick itself, so nobody types anything and the report can say "Priya, 10:42".
 *
 * ⚠️ AN OWNER IS NOT A LOCK. Anybody who may work the job ticks any item: plans
 * change on a roof, and a checklist that refuses the person who did the work
 * makes the record lie. The item then shows who REALLY did it.
 *
 * ⚠️ NO TIME PER ITEM. Time stays per person on the job (crew.ts / job-time.ts).
 * Start/stop per item is tapped all day and is wrong by lunchtime; a part big
 * enough to need its own time is its own task.
 */

/** Refusal codes the screens translate. */
export const CHECKLIST_CODES = {
  /** An owner must already be on THIS job's crew — nobody is added to a crew from a checklist. */
  OWNER_NOT_ON_CREW: 'CHECKLIST_OWNER_NOT_ON_CREW',
  /** Only the leader or the office give an item to somebody; a member takes a free one or gives back their own. */
  OWNER_NOT_YOURS: 'CHECKLIST_OWNER_NOT_YOURS',
  /** Somebody else's item is reworded or removed only by them, the leader or the office. */
  ITEM_NOT_YOURS: 'CHECKLIST_ITEM_NOT_YOURS',
  /** The item changed between reading and writing it — two people at once. Nothing was written. */
  CHANGED: 'CHECKLIST_CHANGED',
} as const;
export type ChecklistCode = (typeof CHECKLIST_CODES)[keyof typeof CHECKLIST_CODES];

/** What decides an owner change — resolved by the server, never sent by a client. */
export interface ChecklistAuthority {
  actorId: string;
  /** The office: admin, or "assign tasks" org-wide or in the job's workspace. */
  isOffice: boolean;
  /** Who leads this job right now (crew.ts effectiveLeader), acting included. */
  leaderId: string | null;
  /** Everybody on this job's crew. */
  crewIds: readonly string[];
}

export type ChecklistVerdict = { ok: true } | { ok: false; code: ChecklistCode };

/**
 * May this person move this item from `from` to `to` (an owner id, or null for nobody)?
 *
 *   • the target must be on the crew (or nobody);
 *   • the leader and the office give any item to anybody on the crew;
 *   • a member TAKES a free item for themselves, or GIVES BACK their own.
 */
export function mayChangeChecklistOwner(a: ChecklistAuthority, from: string | null, to: string | null): ChecklistVerdict {
  if (from === to) return { ok: true };
  if (to !== null && !a.crewIds.includes(to)) return { ok: false, code: CHECKLIST_CODES.OWNER_NOT_ON_CREW };
  if (a.isOffice || (a.leaderId !== null && a.leaderId === a.actorId)) return { ok: true };
  const onCrew = a.crewIds.includes(a.actorId);
  if (onCrew && from === null && to === a.actorId) return { ok: true };
  if (onCrew && from === a.actorId && to === null) return { ok: true };
  return { ok: false, code: CHECKLIST_CODES.OWNER_NOT_YOURS };
}

/**
 * May this person reword or remove an item? Their own, a free one, or — as the
 * leader or the office — anybody's. ⚠️ Without this the owner rule was one
 * step deep: delete Conor's item, add it back as your own.
 */
export function mayEditChecklistItem(a: ChecklistAuthority, ownerId: string | null): ChecklistVerdict {
  if (!ownerId || ownerId === a.actorId) return { ok: true };
  if (a.isOffice || (a.leaderId !== null && a.leaderId === a.actorId)) return { ok: true };
  return { ok: false, code: CHECKLIST_CODES.ITEM_NOT_YOURS };
}

/**
 * The fields a tick writes. Ticked: who and when. Unticked: both cleared, so an
 * untick never leaves somebody named on work that is not done.
 */
export function checklistCompletion(isCompleted: boolean, actorId: string, at: Date) {
  return isCompleted
    ? { isCompleted: true, completedById: actorId, completedAt: at }
    : { isCompleted: false, completedById: null, completedAt: null };
}

/** The least an item must carry for the screens' rules. */
export interface ChecklistItemLike {
  id: string;
  isCompleted: boolean;
  position?: number | null;
  assigneeId?: string | null;
}

/**
 * The phone's two groups: MINE first (what is asked of me), then the rest of
 * the crew's. Each keeps the checklist's own order.
 */
export function splitChecklist<T extends ChecklistItemLike>(items: readonly T[], meId: string | null | undefined): { mine: T[]; crew: T[] } {
  const ordered = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  if (!meId) return { mine: [], crew: ordered };
  return { mine: ordered.filter((i) => i.assigneeId === meId), crew: ordered.filter((i) => i.assigneeId !== meId) };
}

/** Items still open that belong to this person — the clock-out sheet's line and the leader's list. */
export function openChecklistOf<T extends ChecklistItemLike>(items: readonly T[], userId: string): T[] {
  return items.filter((i) => !i.isCompleted && i.assigneeId === userId);
}

/** Was it ticked by somebody other than its owner? The screens say so instead of hiding it. */
export function tickedByOther(item: { assigneeId?: string | null; completedById?: string | null; isCompleted: boolean }): boolean {
  return item.isCompleted && !!item.assigneeId && !!item.completedById && item.assigneeId !== item.completedById;
}
