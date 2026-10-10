import type { ContractFields, ParsedReceipt, PresignedUpload } from '@hbcfield/shared/client';
import { call, E } from './client';

export type { ContractFields };

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

// NOTE: the client already unwraps the `{ data: T }` envelope, so nothing
// here may unwrap `.data` a second time.
export const assetsApi = {
  /**
   * What I hold right now, and whether this organization hands things out at all.
   *
   * ⚠️ `canPropose` cannot be inferred from an empty list: a member holds
   * nothing both when the organization runs no assets and when they simply have
   * not been given one — and the second is exactly who "send a document" is
   * for. Without it the button is hidden from the people who need it, or shown
   * to every organization that never bought Assets.
   */
  mine: async (): Promise<{ periods: HeldAsset[]; canPropose: boolean }> => {
    const res: { periods: HeldAsset[]; canPropose?: boolean } | null = await call(E.assets.mine);
    return { periods: res?.periods ?? [], canPropose: !!res?.canPropose };
  },

  /** What I have sent in, and what happened to it. */
  myExpenses: async (): Promise<MyExpense[]> => {
    const res: MyExpense[] | null = await call(E.assets.myExpenses);
    return res ?? [];
  },

  /**
   * A URL to PUT the photograph at.
   *
   * `occurredAt` is sent because it decides who may file this at all — the
   * check is against who held the asset ON THAT DATE, not today, so yesterday's
   * fuel can still be filed the morning after the van goes back.
   */
  presignReceipt: (assetId: string, input: { fileName: string; mimeType: string; occurredAt?: string }): Promise<PresignedUpload> =>
    call(E.assets.expensePresign, { id: assetId }, { body: input }),

  /**
   * Read a PDF receipt the phone itself cannot open.
   *
   * ⚠️ Images are NOT sent here. The on-device reader is better than anything
   * the server could run on the same photograph, and free — calling this for an
   * image would trade a good local answer for a worse remote one, plus a round
   * trip at a petrol pump on one bar of signal.
   *
   * `read: false` is a normal answer, not an error: a scanned PDF has no text
   * layer and there is nothing to find. The amount gets typed, as it would have
   * been anyway.
   */
  readReceipt: (
    assetId: string,
    input: { fileKey: string; occurredAt?: string },
  ): Promise<{ read: true; receipt: ParsedReceipt } | { read: false; reason: 'NOT_A_PDF' | 'NO_TEXT_LAYER' }> =>
    call(E.assets.expenseRead, { id: assetId }, { body: input }),

  submitExpense: (assetId: string, input: SubmitExpenseInput): Promise<MyExpense> =>
    call(E.assets.submitExpense, { id: assetId }, { body: { ...input } }),

  // ── The logbook ───────────────────────────────────────────────────────────

  /** Everything I logged, costs included, with what happened to each. */
  myLog: async (input: { assetId?: string; limit?: number } = {}): Promise<MyLogEntry[]> => {
    const res: MyLogEntry[] | null = await call(E.assets.myLog, { assetId: input.assetId, limit: input.limit || undefined });
    return res ?? [];
  },

  /** What is due soon or overdue on what I hold. Overdue first. */
  dueMine: async (): Promise<DueItem[]> => {
    const res: { items: DueItem[] } | null = await call(E.assets.dueMine);
    return res?.items ?? [];
  },

  /**
   * A URL to PUT a logbook photo at. The log type and the date travel because
   * together they decide who may file it: fuel is the driver's that day, a dent
   * is anybody's who can see the van.
   */
  presignLog: (assetId: string, input: { logType: string; fileName: string; mimeType: string; occurredAt?: string }): Promise<PresignedUpload> =>
    call(E.assets.logPresign, { id: assetId }, { body: input }),

  createLog: (assetId: string, input: CreateLogInput): Promise<MyLogEntry> =>
    call(E.assets.addLog, { id: assetId }, { body: { ...input } }),

  /** Take back my own entry while it is still waiting. */
  withdrawLog: (assetId: string, entryId: string): Promise<{ id: string }> =>
    call(E.assets.withdrawLog, { id: assetId, entryId }),
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

  withdraw: (id: string): Promise<{ id: string }> =>
    call(E.assets.withdrawProposal, { id }),
};
