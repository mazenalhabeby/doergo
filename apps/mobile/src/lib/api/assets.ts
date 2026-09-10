import { fetchWithAuth } from './client';

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

// NOTE: fetchWithAuth already unwraps the `{ data: T }` envelope, so nothing
// here may unwrap `.data` a second time.
export const assetsApi = {
  /** What I hold right now. Open custody periods, newest first. */
  mine: async (): Promise<HeldAsset[]> => {
    const res = await fetchWithAuth<{ periods: HeldAsset[] }>('/assets/mine');
    return res?.periods ?? [];
  },

  /** What I have sent in, and what happened to it. */
  myExpenses: async (): Promise<MyExpense[]> => {
    const res = await fetchWithAuth<MyExpense[]>('/assets/expenses/mine');
    return res ?? [];
  },

  /**
   * A URL to PUT the photograph at.
   *
   * `occurredAt` is sent because it decides who may file this at all — the
   * check is against who held the asset ON THAT DATE, not today, so yesterday's
   * fuel can still be filed the morning after the van goes back.
   */
  presignReceipt: (assetId: string, input: { fileName: string; mimeType: string; occurredAt?: string }) =>
    fetchWithAuth<{ uploadUrl: string; fileKey: string; expiresIn: number; maxFileSize: number }>(
      `/assets/${assetId}/expenses/presign`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  submitExpense: (assetId: string, input: SubmitExpenseInput) =>
    fetchWithAuth<MyExpense>(`/assets/${assetId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

/** The reading off a contract, after a person has corrected it. */
export interface ContractFields {
  name?: string;
  registration?: string;
  vin?: string;
  serial?: string;
  manufacturer?: string;
  model?: string;
  startsOn?: string;
  endsOn?: string;
}

export type ContractStep =
  | { kind: 'create'; asset: { name: string } }
  | { kind: 'hand-over'; startsOn?: string }
  | { kind: 'close'; assetId: string; assetName: string }
  | { kind: 'retire'; assetId: string; assetName: string };

export interface ContractPreview {
  asset: { name: string };
  steps: ContractStep[];
  canApply: boolean;
  startClamped: boolean;
}

export interface ContractProposalInput {
  categoryId: string;
  holderUserId: string;
  fields: ContractFields;
  retireReplaced?: boolean;
}

/**
 * A contract → a record, a handover, and the retirement of what it replaces.
 *
 * ⚠️ The reading is done ON THE DEVICE and the TEXT is never sent. A rental
 * agreement carries a home address, a licence number and bank details; what
 * travels is the six fields a person confirmed.
 *
 * ⚠️ And what travels is only ever the READING. The steps — which custody to
 * close, which record to retire — are computed on the server from the kind and
 * from what the member actually holds. A client that could name the record to
 * retire could retire any record.
 */
export interface AssetKind {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  spaceId?: string | null;
  config?: unknown;
}

export const assetContractsApi = {
  /** The org's kinds — needed to say WHAT is being created. `canViewAllTasks`. */
  kinds: async (): Promise<AssetKind[]> => {
    const res = await fetchWithAuth<AssetKind[]>('/asset-categories');
    return res ?? [];
  },

  preview: (input: ContractProposalInput) =>
    fetchWithAuth<ContractPreview>('/assets/contracts/preview', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  apply: (input: ContractProposalInput) =>
    fetchWithAuth<{ assetId: string; name: string; replaced: string[]; retired: boolean; startClamped: boolean }>(
      '/assets/contracts/apply',
      { method: 'POST', body: JSON.stringify(input) },
    ),
};
