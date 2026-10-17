import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type {
  AssetExpenseStatus,
  AssetProposal,
  ContractFields,
  ContractPreview,
  ContractProposalInput,
  ContractReading,
  MaintenanceHistoryItem,
  PendingExpense,
} from './types/assets';
import { assetsEndpoints } from '@hbcfield/shared/client';

/** What the office decides: pages members send in, contracts, expenses, and the asset's history. Part of `assetsApi`, moved here unchanged. */
export const assetReviewApi = {
  // ============================================
  // PROPOSALS — a member sends a page, the office decides
  // ============================================

  /**
   * Proposals waiting on a decision the caller may make. With a `spaceId`, only
   * THAT workspace's own (its kind is there, or no kind and the member is
   * assigned there) — a workspace's Assets tab. The server narrows; it never widens.
   */
  getPendingProposals: async (spaceId?: string) => {
    const response = await call(assetsEndpoints.pendingProposals, undefined, { query: { spaceId: spaceId || undefined } }) as ApiResponse<{ success: boolean; data: { proposals: AssetProposal[] } }>;
    if (response.error) throw apiError(response);
    return response.data?.data?.proposals ?? [];
  },

  /**
   * Accept it: create the thing, hand it over, retire what it replaces.
   *
   * ⚠️ The plan is built by the server AT THIS MOMENT, from the kind and from
   * what the member holds today — never from anything stored when the page was
   * uploaded. A page sent three weeks ago may name a van since given to
   * somebody else.
   */
  acceptProposal: async (
    id: string,
    input: { categoryId?: string; typeId?: string; fields?: ContractFields; retireReplaced?: boolean },
  ) => {
    const response = await call(assetsEndpoints.acceptProposal, { id }, { body: input }) as ApiResponse<{ success: boolean; data: { id: string; assetId: string | null } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  rejectProposal: async (id: string, note?: string) => {
    const response = await call(assetsEndpoints.rejectProposal, { id }, { body: { note } }) as ApiResponse<{ success: boolean; data: { id: string } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** A short-lived link to the page. A POST, and nothing lists these. */
  getProposalDocumentUrl: async (id: string) => {
    const response = await call(assetsEndpoints.proposalDocumentUrl, { id }, { body: {} }) as ApiResponse<{ success: boolean; data: { url: string; mimeType: string | null } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // ============================================
  // CONTRACTS — read one, then propose, then apply
  // ============================================

  /** Text → fields. Decides nothing; the browser has no reader of its own. */
  readContract: async (text: string) => {
    const response = await call(assetsEndpoints.contractRead, undefined, { body: { text } }) as ApiResponse<{ success: boolean; data: ContractReading }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /**
   * What accepting it would do.
   *
   * ⚠️ A POST, not a GET, because it carries a plate, a VIN and a person's id —
   * and this gateway logs URLs. The steps come back computed on the SERVER from
   * the kind and from what the member actually holds; nothing here names the
   * record to retire, and nothing here could.
   */
  previewContract: async (input: ContractProposalInput) => {
    const response = await call(assetsEndpoints.contractPreview, undefined, { body: input }) as ApiResponse<{ success: boolean; data: ContractPreview }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** Do it — all of it, or none of it. The server recomputes the plan first. */
  applyContract: async (input: ContractProposalInput) => {
    const response = await call(assetsEndpoints.contractApply, undefined, { body: input }) as ApiResponse<{
      success: boolean;
      data: { assetId: string; name: string; replaced: string[]; retired: boolean; startClamped: boolean };
    }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // ============================================
  // EXPENSES — a member spends, the office accepts
  // ============================================

  getPendingExpenses: async () => {
    const response = await call(assetsEndpoints.pendingExpenses) as ApiResponse<{ success: boolean; data: { entries: PendingExpense[]; totalCents: number } }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? { entries: [], totalCents: 0 };
  },

  reviewExpense: async (entryId: string, decision: 'accept' | 'reject', note?: string) => {
    const response = await call(assetsEndpoints.reviewExpense, { entryId }, { body: { decision, note } }) as ApiResponse<{ success: boolean; data: { id: string; status: AssetExpenseStatus } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /**
   * A short-lived link to one receipt.
   *
   * ⚠️ A POST, and nothing lists these. A URL handed out in bulk outlives the
   * reason it was issued; minting one per request keeps looking at somebody's
   * spending an act rather than a side effect of opening a page.
   */
  getReceiptUrl: async (entryId: string) => {
    const response = await call(assetsEndpoints.receiptUrl, { entryId }, { body: {} }) as ApiResponse<{ success: boolean; data: { url: string; mimeType: string | null } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // scope 'all' includes work still open — the record page needs it, or a
  // technician cannot tell that a job is already raised.
  getAssetHistory: async (assetId: string, scope: 'done' | 'all' = 'all') => {
    const response = await call(assetsEndpoints.history, { id: assetId }, { query: { scope } }) as ApiResponse<{ success: boolean; data: MaintenanceHistoryItem[] }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },
};
