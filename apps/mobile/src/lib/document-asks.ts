/**
 * WHAT IS ASKED OF A MEMBER, AND WHAT THEY MAY STILL SEND — one rule, read by
 * the "Still needed from you" card and by "What is it?" in Add a document.
 *
 * The life of anything a member hands in:
 *
 *   not sent / sent back / expired / about to expire  → ASKED (tap to send)
 *   sent, or waiting on this phone to be sent          → CHECKING (not offered again)
 *   approved and valid                                 → GONE
 *
 * ⚠️ Both surfaces used to decide this separately: the card listed only
 * missing / sent back / expired, while "What is it?" offered every type,
 * including one already approved and one still being checked — so a member
 * could send the same passport twice and never see it leave the list.
 *
 * A type nobody REQUIRES follows the same rule off the member's own documents.
 * A multi-page type ("Other document") is never gone: somebody can have as
 * many invoices as they like.
 */

export type RequirementState = 'MISSING' | 'AWAITING_REVIEW' | 'REJECTED' | 'MET' | 'EXPIRING' | 'EXPIRED';

export interface AskRequirement {
  typeId: string;
  label: string;
  state: RequirementState;
  expiresOn: string | null;
  blocksWork: boolean;
}

export interface AskType {
  id: string;
  label: string;
  direction: 'ISSUED' | 'SUPPLIED';
  isActive: boolean;
  multiPage?: boolean;
  description?: string | null;
}

export interface AskDocument {
  typeId: string;
  status: string;
  standing: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING' | null;
  rejectionReason?: string | null;
  issuedAt: string;
}

/** Why a type is asked for — what the row says under its name. */
export type AskWhy = 'missing' | 'sentBack' | 'expired' | 'expiring';

export interface AskedRow {
  typeId: string;
  label: string;
  why: AskWhy;
  blocksWork: boolean;
  expiresOn: string | null;
  /** The office's words, when it was sent back. */
  reason: string | null;
}

interface CheckingRow {
  typeId: string;
  label: string;
  /** Still on this phone, not yet sent — no signal. */
  onPhone: boolean;
}

const WHY: Partial<Record<RequirementState, AskWhy>> = {
  MISSING: 'missing',
  REJECTED: 'sentBack',
  EXPIRED: 'expired',
  EXPIRING: 'expiring',
};

/** The member's newest document of a type, if any. */
function latestOf(typeId: string, docs: readonly AskDocument[]): AskDocument | undefined {
  let best: AskDocument | undefined;
  for (const d of docs) {
    if (d.typeId !== typeId) continue;
    if (!best || Date.parse(d.issuedAt) > Date.parse(best.issuedAt)) best = d;
  }
  return best;
}

/**
 * The "Still needed from you" card: every REQUIRED type that is not settled.
 * Asked rows first (the ones that block work first), then the ones being checked.
 */
export function stillNeeded(
  requirements: readonly AskRequirement[],
  docs: readonly AskDocument[],
  queuedTypeIds: ReadonlySet<string>,
): { asked: AskedRow[]; checking: CheckingRow[] } {
  const asked: AskedRow[] = [];
  const checking: CheckingRow[] = [];
  for (const r of requirements) {
    if (queuedTypeIds.has(r.typeId)) { checking.push({ typeId: r.typeId, label: r.label, onPhone: true }); continue; }
    if (r.state === 'AWAITING_REVIEW') { checking.push({ typeId: r.typeId, label: r.label, onPhone: false }); continue; }
    const why = WHY[r.state];
    if (!why) continue; // MET — gone
    asked.push({
      typeId: r.typeId,
      label: r.label,
      why,
      blocksWork: r.blocksWork,
      expiresOn: r.expiresOn,
      reason: why === 'sentBack' ? latestOf(r.typeId, docs)?.rejectionReason?.trim() || null : null,
    });
  }
  asked.sort((a, b) => Number(b.blocksWork) - Number(a.blocksWork));
  return { asked, checking };
}

/**
 * "What is it?" — the member's own types, sorted into what is asked, what is
 * being checked, and anything else they may send. A type that is approved and
 * valid appears nowhere.
 */
export function typeGroups(
  types: readonly AskType[],
  requirements: readonly AskRequirement[],
  docs: readonly AskDocument[],
  queuedTypeIds: ReadonlySet<string>,
): { asked: (AskedRow & { type: AskType })[]; checking: (CheckingRow & { type: AskType })[]; other: AskType[] } {
  const suppliable = types.filter((ty) => ty.direction === 'SUPPLIED' && ty.isActive);
  const need = stillNeeded(requirements, docs, queuedTypeIds);
  const byId = new Map(suppliable.map((ty) => [ty.id, ty] as const));
  const required = new Set(requirements.map((r) => r.typeId));

  const asked = need.asked.flatMap((row) => { const type = byId.get(row.typeId); return type ? [{ ...row, type }] : []; });
  const checking = need.checking.flatMap((row) => { const type = byId.get(row.typeId); return type ? [{ ...row, type }] : []; });
  const other: AskType[] = [];

  for (const type of suppliable) {
    if (required.has(type.id)) continue; // decided above
    if (type.multiPage) { other.push(type); continue; } // as many as you need
    if (queuedTypeIds.has(type.id)) { checking.push({ typeId: type.id, label: type.label, onPhone: true, type }); continue; }
    const last = latestOf(type.id, docs);
    if (last?.status === 'PENDING_VERIFICATION') { checking.push({ typeId: type.id, label: type.label, onPhone: false, type }); continue; }
    const settled = !!last && last.status !== 'REJECTED' && last.status !== 'REVOKED' && last.standing !== 'EXPIRED' && last.standing !== 'EXPIRING';
    if (settled) continue; // approved and valid — gone
    other.push(type);
  }
  return { asked, checking, other };
}
