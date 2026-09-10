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
