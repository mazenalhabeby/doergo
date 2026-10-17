import type { ContractFields, PresignedUpload } from '@hbcfield/shared/client';
import { call, E } from './client';

/**
 * The things this member holds, and what they spend on them.
 *
 * Two endpoints out of the whole asset register, and deliberately so: a driver
 * is not an asset manager and cannot list the organization's equipment. What
 * they can see is what has been HANDED TO THEM, and what they may file against
 * is what they held on the day the money moved. Both are decided server-side
 * from the verified token; nothing here is a filter that could be removed.
 */

export interface HeldAsset {
  id: string;
  assetId: string;
  startedAt: string;
  endedAt: string | null;
  asset?: {
    id: string;
    name: string;
    status: string;
    serialNumber?: string | null;
    model?: string | null;
    manufacturer?: string | null;
    category?: { id: string; name: string; icon?: string | null; color?: string | null; config?: unknown } | null;
  };
  totals: { inCents: number; outCents: number; netCents: number; entries: number };
}

export interface MyExpense {
  id: string;
  assetId: string;
  category: string;
  direction: 'IN' | 'OUT';
  amountCents: number;
  note: string | null;
  occurredAt: string;
  status: 'SUBMITTED' | 'RECORDED' | 'REJECTED';
  reviewNote: string | null;
  reviewedAt: string | null;
  hasReceipt: boolean;
  asset?: { id: string; name: string } | null;
}

export interface SubmitExpenseInput {
  category: string;
  amountCents: number;
  note?: string;
  occurredAt?: string;
  receiptKey?: string;
  receiptName?: string;
  receiptMime?: string;
}

/**
 * One logbook entry I filed — fuel, an oil change, a dent, or a cost.
 *
 * `category` is the heading it was filed under AT THE TIME: the type's own label
 * for a log entry, the chosen heading for a cost. Rows read as they did the day
 * they were written, whatever the kind is renamed to since.
 */
export interface MyLogEntry {
  id: string;
  assetId: string;
  /** `cost` for the ledger's own entries. */
  logType: string;
  category: string;
  direction: 'IN' | 'OUT';
  amountCents: number;
  note: string | null;
  values: Record<string, string | number> | null;
  occurredAt: string;
  status: 'SUBMITTED' | 'RECORDED' | 'REJECTED';
  reviewNote: string | null;
  reviewedAt: string | null;
  hasReceipt: boolean;
  asset?: { id: string; name: string } | null;
}

/** Something due on a thing I hold. Computed on the server from the asset's stored state. */
export interface DueItem {
  assetId: string;
  assetName: string;
  key: string;
  label: string;
  color: string;
  stage: 'ok' | 'soon' | 'overdue';
  progress: number;
  daysLeft: number | null;
  unitsLeft: number | null;
  unit: string | null;
  reading: number | null;
  dueAt: string | null;
  dueReading: number | null;
}

export interface CreateLogInput {
  logType: string;
  /** Answers keyed by field key; a money field in integer cents. */
  values: Record<string, string | number>;
  note?: string;
  occurredAt?: string;
  receiptKey?: string;
  receiptName?: string;
  receiptMime?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE REGISTER — a workspace's equipment, for whoever holds `canViewAssets` there.

   ⚠️ Not the driver's door. "What I have" above is decided by custody; this is
   decided by a PERMISSION in the record's workspace (view / log / manage), and
   the server narrows every list and refuses every record outside it (404). The
   phone only chooses what to render.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RegisterHolder {
  id: string;
  userId: string | null;
  customerId: string | null;
  user?: { id: string; firstName: string; lastName: string } | null;
  customer?: { id: string; name: string } | null;
}

export interface RegisterAsset {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'RETIRED' | string;
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  notes?: string | null;
  locationAddress?: string | null;
  category?: {
    id: string;
    name: string;
    color?: string | null;
    icon?: string | null;
    spaceId?: string | null;
    config?: unknown;
  } | null;
  type?: { id: string; name: string } | null;
  holders?: RegisterHolder[];
}

/** A logbook entry as the record shows it — with who wrote it. */
export interface RegisterLogEntry extends MyLogEntry {
  author?: { id: string; firstName: string; lastName: string } | null;
}

export const REGISTER_PAGE_SIZE = 40;

export const assetRegisterApi = {
  /** One page of a workspace's equipment, by name. Retired records stay out unless asked for. */
  list: async (q: {
    spaceId?: string;
    search?: string;
    categoryId?: string;
    page?: number;
  }): Promise<RegisterAsset[]> => {
    const res: RegisterAsset[] | null = await call(E.assets.list, {
      spaceId: q.spaceId,
      search: q.search?.trim() || undefined,
      categoryId: q.categoryId,
      hideRetired: 'true',
      page: q.page ?? 1,
      limit: REGISTER_PAGE_SIZE,
    });
    return Array.isArray(res) ? res : [];
  },

  get: (id: string): Promise<RegisterAsset> => call(E.assets.get, { id }),

  /** The kinds of one workspace, with how many records each holds — the filter chips. */
  kinds: async (spaceId?: string): Promise<{ id: string; name: string; count: number }[]> => {
    const res = await call(E.assetCategories.list, spaceId ? { spaceId } : undefined);
    return (Array.isArray(res) ? (res as AssetKindRow[]) : []).map((k) => ({
      id: k.id,
      name: k.name,
      count: k._count?.assets ?? 0,
    }));
  },

  /** The logbook, newest first, keyset-paged. */
  log: async (id: string, cursor?: string): Promise<{ entries: RegisterLogEntry[]; nextCursor: string | null }> => {
    const res: { entries?: RegisterLogEntry[]; nextCursor?: string | null } | null = await call(E.assets.log, {
      id,
      cursor,
      limit: 30,
    });
    return { entries: res?.entries ?? [], nextCursor: res?.nextCursor ?? null };
  },

  /** Manage: the status only — every other field is the web's form. */
  setStatus: (id: string, status: string): Promise<RegisterAsset> =>
    call(E.assets.update, { id }, { body: { status } }),

  /** Manage: hand it to a member of the workspace, or take it back (nobody). */
  handOver: (id: string, input: { userId: string | null; reason?: string }): Promise<unknown> =>
    call(
      E.assets.handOver,
      { id },
      { body: { to: input.userId ? [{ userId: input.userId }] : [], reason: input.reason || undefined } },
    ),
};

/** One page I sent in, and what happened to it. */
export interface MyProposal {
  id: string;
  fields: ContractFields;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAssetId: string | null;
  hasDocument: boolean;
  documentKind: string;
  createdAt: string;
}

export interface RaiseProposalInput {
  fields: ContractFields;
  signals?: string[];
  documentKind?: string;
  fileKey?: string;
  fileName?: string;
  fileMime?: string;
}

/**
 * Sending a page in.
 *
 * ⚠️ The member NEVER creates an asset — creating a record, reassigning the
 * organization's property and taking a vehicle off the books is
 * `canManageAssets` and always will be. What a driver handed a rental agreement
 * at a desk can do is send the page, and somebody responsible for them decides.
 *
 * ⚠️ The TEXT never leaves the phone: a rental agreement carries a home
 * address, a licence number and bank details. The six confirmed fields travel,
 * and the PAGE itself only because a reviewer has to be able to check it.
 */
export const assetProposalsApi = {
  presign: (input: { fileName: string; mimeType: string }): Promise<PresignedUpload> =>
    call(E.assets.proposalUploadUrl, undefined, { body: input }),

  raise: (input: RaiseProposalInput): Promise<MyProposal> =>
    call(E.assets.raiseProposal, undefined, { body: { ...input } }),

  mine: async (): Promise<MyProposal[]> => {
    const res: MyProposal[] | null = await call(E.assets.myProposals);
    return res ?? [];
  },

  withdraw: (id: string): Promise<{ id: string }> => call(E.assets.withdrawProposal, { id }),
};

/** An asset kind as the category list returns it — the fields the filter chips read. */
interface AssetKindRow {
  id: string;
  name: string;
  _count?: { assets?: number };
}
